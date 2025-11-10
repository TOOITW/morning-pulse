"""
Article Summarization with Numerical Verification
Implements rule-based extractive summarization focused on financial accuracy
"""

import re
from typing import Any

from ..lib.db import execute_query, execute_update
from ..lib.job_processor import JobProcessor
from ..lib.logger import get_logger

logger = get_logger(__name__)


def extract_numbers(text: str) -> list[tuple[str, str]]:
    """
    Extract numerical facts from text (currency, percentages, dates)
    Returns list of (number, context) tuples
    """
    patterns = [
        # Currency: $123.45, $1.2B, £100
        (r"[\$£€¥]\s?\d+(?:\.\d+)?(?:[BMK])?", "currency"),
        # Percentages: 12.3%, +5.6%
        (r"[+-]?\d+(?:\.\d+)?%", "percentage"),
        # Large numbers with commas: 1,234,567
        (r"\d{1,3}(?:,\d{3})+(?:\.\d+)?", "number"),
        # Decimal numbers: 12.34
        (r"\d+\.\d+", "decimal"),
        # Dates: 2024-01-15, Jan 15, 2024
        (r"\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}", "date"),
    ]

    numbers = []
    for pattern, context in patterns:
        matches = re.finditer(pattern, text, re.IGNORECASE)
        for match in matches:
            numbers.append((match.group(), context))

    return numbers


def extract_key_sentences(text: str, max_sentences: int = 2) -> list[str]:
    """
    Extract key sentences using rule-based heuristics
    Prioritizes:
    1. First sentence (usually contains main point)
    2. Sentences with numbers (financial data)
    3. Sentences with action verbs (announced, reported, said)
    """
    # Split into sentences
    sentences = re.split(r"[.!?]+", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

    if not sentences:
        return []

    # Score sentences
    scored_sentences = []
    action_verbs = [
        "announced",
        "reported",
        "said",
        "revealed",
        "confirmed",
        "declined",
        "rose",
        "fell",
        "gained",
        "lost",
    ]

    for i, sentence in enumerate(sentences):
        score = 0

        # First sentence gets high score
        if i == 0:
            score += 10

        # Contains numbers
        if re.search(r"\d+", sentence):
            score += 5

        # Contains action verbs
        for verb in action_verbs:
            if verb in sentence.lower():
                score += 3
                break

        # Length bonus (prefer medium-length sentences)
        word_count = len(sentence.split())
        if 10 <= word_count <= 30:
            score += 2

        scored_sentences.append((score, sentence))

    # Sort by score and take top N
    scored_sentences.sort(reverse=True, key=lambda x: x[0])
    return [sent for _, sent in scored_sentences[:max_sentences]]


def verify_numerical_consistency(summary: str, original_text: str) -> bool:
    """
    Verify that numbers in summary appear in original text
    Returns True if all numbers are consistent
    """
    summary_numbers = extract_numbers(summary)
    original_numbers = extract_numbers(original_text)

    # Get just the number values
    summary_values = {num for num, _ in summary_numbers}
    original_values = {num for num, _ in original_numbers}

    # Check if all summary numbers exist in original
    for num in summary_values:
        if num not in original_values:
            logger.warning(
                f"Number mismatch: '{num}' in summary but not in original",
                summary_number=num,
            )
            return False

    return True


def generate_summary(
    title: str,
    content: str | None,
    summary_raw: str | None,
) -> tuple[str, bool]:
    """
    Generate 2-sentence summary using rule-based extraction
    Returns (summary, is_verified) tuple
    """
    # Build full text for analysis
    text_parts = [title]
    if content:
        text_parts.append(content)
    elif summary_raw:
        text_parts.append(summary_raw)

    full_text = " ".join(text_parts)

    # Extract key sentences
    key_sentences = extract_key_sentences(full_text, max_sentences=2)

    if not key_sentences:
        # Fallback: use first paragraph or summary_raw
        if content:
            paragraphs = content.split("\n\n")
            summary = paragraphs[0][:300] + "..."
        elif summary_raw:
            summary = summary_raw[:300] + ("..." if len(summary_raw) > 300 else "")
        else:
            summary = title

        return summary, False

    # Join sentences
    summary = " ".join(key_sentences)

    # Verify numerical consistency
    is_verified = verify_numerical_consistency(summary, full_text)

    # Fallback if verification fails
    if not is_verified and summary_raw:
        logger.warning("Verification failed, using raw summary as fallback")
        summary = summary_raw[:300] + ("..." if len(summary_raw) > 300 else "")
        is_verified = False

    return summary, is_verified


class SummarizationWorker(JobProcessor):
    """
    Worker for generating article summaries
    """

    def __init__(self, poll_interval: int = 5):
        super().__init__("summarization", poll_interval)

    def process_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Process summarization job for a batch of articles
        """
        article_ids = payload.get("article_ids", [])

        if not article_ids:
            raise ValueError("No article IDs provided in payload")

        logger.info(
            f"Starting summarization for {len(article_ids)} articles",
            article_count=len(article_ids),
        )

        # Fetch articles
        articles = self._fetch_articles(article_ids)

        summaries_generated = 0
        summaries_verified = 0
        summaries_failed = 0

        for article in articles:
            try:
                # Generate summary
                summary, is_verified = generate_summary(
                    article["title"],
                    article["content"],
                    article["summary_raw"],
                )

                # Update article
                self._update_article_summary(article["id"], summary)

                summaries_generated += 1
                if is_verified:
                    summaries_verified += 1

                logger.info(
                    f"Generated summary for article {article['id']}",
                    article_id=article["id"],
                    verified=is_verified,
                    length=len(summary),
                )

            except Exception as e:
                summaries_failed += 1
                logger.error(
                    f"Failed to summarize article {article['id']}",
                    exc_info=True,
                    article_id=article["id"],
                    error=str(e),
                )

        return {
            "articles_processed": len(articles),
            "summaries_generated": summaries_generated,
            "summaries_verified": summaries_verified,
            "summaries_failed": summaries_failed,
        }

    def _fetch_articles(self, article_ids: list[str]) -> list[dict[str, Any]]:
        """
        Fetch articles from database
        """
        placeholders = ",".join(["%s"] * len(article_ids))
        query = f"""
        SELECT id, title, content, summary_raw
        FROM articles
        WHERE id IN ({placeholders})
        """

        return execute_query(query, tuple(article_ids))

    def _update_article_summary(self, article_id: str, summary: str) -> None:
        """
        Update article with generated summary
        """
        query = """
        UPDATE articles
        SET summary_2 = %s, updated_at = NOW()
        WHERE id = %s
        """

        execute_update(query, (summary, article_id))


if __name__ == "__main__":
    # Run the worker
    worker = SummarizationWorker()
    worker.start()
