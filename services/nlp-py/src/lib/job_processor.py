"""
Base Job Processor
Abstract class for processing jobs from the queue
"""

import json
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from .db import execute_query, execute_update, get_cursor, initialize_pool
from .logger import get_logger

logger = get_logger(__name__)


class JobProcessor(ABC):
    """
    Abstract base class for job processors
    Subclasses must implement process_job method
    """

    def __init__(self, job_type: str, poll_interval: int = 5):
        """
        Initialize the job processor

        Args:
            job_type: Type of jobs this processor handles
            poll_interval: Seconds between polling for new jobs
        """
        self.job_type = job_type
        self.poll_interval = poll_interval
        self.running = False

    @abstractmethod
    def process_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Process a single job
        Must be implemented by subclasses

        Args:
            payload: Job payload as dictionary

        Returns:
            Result dictionary to be stored in the job record
        """
        pass

    def start(self) -> None:
        """
        Start the job processor loop
        """
        logger.info(f"Starting job processor for type: {self.job_type}")
        self.running = True

        # Initialize database pool
        initialize_pool()

        try:
            while self.running:
                job = self._dequeue_job()

                if job:
                    self._execute_job(job)
                else:
                    # No jobs available, sleep for a bit
                    time.sleep(self.poll_interval)

        except KeyboardInterrupt:
            logger.info("Job processor interrupted by user")
        finally:
            self.stop()

    def stop(self) -> None:
        """
        Stop the job processor
        """
        logger.info(f"Stopping job processor for type: {self.job_type}")
        self.running = False

    def _dequeue_job(self) -> dict[str, Any] | None:
        """
        Dequeue the next pending job of the specified type
        """
        query = """
        UPDATE jobs
        SET status = 'processing',
            started_at = %s,
            attempts = attempts + 1,
            updated_at = %s
        WHERE id = (
            SELECT id
            FROM jobs
            WHERE type = %s
            AND status = 'pending'
            AND scheduled_for <= %s
            ORDER BY scheduled_for ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        )
        RETURNING id, type, payload, attempts, max_attempts
        """

        now = datetime.now()
        result = execute_query(
            query,
            (now, now, self.job_type, now),
            fetch_one=True,
        )

        if result:
            logger.info(
                "Dequeued job",
                job_id=result["id"],
                attempt=result["attempts"],
            )

        return result

    def _execute_job(self, job: dict[str, Any]) -> None:
        """
        Execute a single job
        """
        job_id = job["id"]
        payload = job["payload"]

        try:
            logger.info(f"Processing job {job_id}")
            result = self.process_job(payload)

            # Mark job as completed
            self._complete_job(job_id, result)

        except Exception as e:
            logger.error(
                f"Job {job_id} failed",
                exc_info=True,
                error=str(e),
            )

            # Mark job as failed (will retry if attempts < max_attempts)
            self._fail_job(job_id, job["attempts"], job["max_attempts"], str(e))

    def _complete_job(self, job_id: str, result: dict[str, Any]) -> None:
        """
        Mark a job as completed
        """
        query = """
        UPDATE jobs
        SET status = 'completed',
            result = %s,
            completed_at = %s,
            updated_at = %s
        WHERE id = %s
        """

        now = datetime.now()
        execute_update(
            query,
            (json.dumps(result), now, now, job_id),
        )

        logger.info(f"Job {job_id} completed successfully")

    def _fail_job(
        self,
        job_id: str,
        attempts: int,
        max_attempts: int,
        error: str,
    ) -> None:
        """
        Mark a job as failed
        Reschedule if attempts < max_attempts
        """
        should_retry = attempts < max_attempts

        if should_retry:
            # Exponential backoff: 1min, 2min, 4min, ...
            backoff_minutes = 2 ** (attempts - 1)
            scheduled_for = datetime.now()
            scheduled_for = scheduled_for.replace(
                minute=scheduled_for.minute + backoff_minutes
            )

            query = """
            UPDATE jobs
            SET status = 'pending',
                scheduled_for = %s,
                error_message = %s,
                updated_at = %s
            WHERE id = %s
            """

            now = datetime.now()
            execute_update(
                query,
                (scheduled_for, error, now, job_id),
            )

            logger.warning(
                f"Job {job_id} will retry in {backoff_minutes} minutes",
                attempt=attempts,
                max_attempts=max_attempts,
            )
        else:
            query = """
            UPDATE jobs
            SET status = 'failed',
                error_message = %s,
                completed_at = %s,
                updated_at = %s
            WHERE id = %s
            """

            now = datetime.now()
            execute_update(
                query,
                (error, now, now, job_id),
            )

            logger.error(
                f"Job {job_id} failed permanently",
                attempt=attempts,
                max_attempts=max_attempts,
            )
