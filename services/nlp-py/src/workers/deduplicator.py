"""
Article Deduplication using MinHash and SimHash
Implements clustering of similar articles to reduce redundancy
"""

import hashlib
import uuid
import re
from typing import Any

from datasketch import MinHash, MinHashLSH

from ..lib.db import execute_query, execute_update, get_cursor
from ..lib.job_processor import JobProcessor
from ..lib.logger import get_logger

logger = get_logger(__name__)


def normalize_text(text: str) -> str:
    """
    Normalize text for similarity comparison
    """
    # Lowercase
    text = text.lower()

    # Remove URLs
    text = re.sub(r"https?://\S+", "", text)

    # Remove special characters but keep spaces
    text = re.sub(r"[^\w\s]", " ", text)

    # Remove extra whitespace
    text = re.sub(r"\s+", " ", text).strip()

    return text


def tokenize(text: str) -> list[str]:
    """
    Tokenize text into words for MinHash
    """
    normalized = normalize_text(text)
    return normalized.split()


def compute_simhash(text: str, num_bits: int = 64) -> str:
    """
    Compute SimHash for text similarity detection
    Returns hex string representation
    """
    tokens = tokenize(text)
    if not tokens:
        return "0" * (num_bits // 4)  # Return zero hash for empty text

    # Initialize bit vector
    vector = [0] * num_bits

    # Hash each token and update bit vector
    for token in tokens:
        token_hash = int(hashlib.md5(token.encode()).hexdigest(), 16)

        for i in range(num_bits):
            if token_hash & (1 << i):
                vector[i] += 1
            else:
                vector[i] -= 1

    # Convert to binary fingerprint
    fingerprint = 0
    for i in range(num_bits):
        if vector[i] > 0:
            fingerprint |= 1 << i

    # Convert to hex string
    return format(fingerprint, f"0{num_bits // 4}x")


def compute_minhash(text: str, num_perm: int = 128) -> MinHash:
    """
    Compute MinHash for Jaccard similarity estimation
    """
    minhash = MinHash(num_perm=num_perm)
    tokens = tokenize(text)

    for token in tokens:
        minhash.update(token.encode("utf-8"))

    return minhash


def hamming_distance(hash1: str, hash2: str) -> int:
    """
    Calculate Hamming distance between two hex hashes
    """
    if len(hash1) != len(hash2):
        raise ValueError("Hashes must be same length")

    # Convert hex to binary
    bin1 = bin(int(hash1, 16))[2:].zfill(len(hash1) * 4)
    bin2 = bin(int(hash2, 16))[2:].zfill(len(hash2) * 4)

    # Count differing bits
    return sum(b1 != b2 for b1, b2 in zip(bin1, bin2))


class DeduplicationWorker(JobProcessor):
    """
    Worker for deduplicating articles using MinHash LSH
    """

    def __init__(self, poll_interval: int = 5):
        super().__init__("deduplication", poll_interval)
        self.lsh: MinHashLSH | None = None
        # Spec requires ≥0.85 similarity threshold within 48h window
        self.similarity_threshold = 0.85  # Jaccard similarity threshold

    def process_job(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        Process deduplication job for a batch of articles
        """
        article_ids = payload.get("article_ids", [])

        if not article_ids:
            raise ValueError("No article IDs provided in payload")

        logger.info(
            f"Starting deduplication for {len(article_ids)} articles",
            article_count=len(article_ids),
        )

        # Initialize LSH index
        self.lsh = MinHashLSH(
            threshold=self.similarity_threshold,
            num_perm=128,
        )

        # Fetch articles
        articles = self._fetch_articles(article_ids)

        # Process each article
        clusters_created = 0
        articles_clustered = 0

        for article in articles:
            # Compute hashes
            text = f"{article['title']} {article['summary_raw'] or ''}"
            simhash = compute_simhash(text)
            minhash = compute_minhash(text)

            # Update article with simhash
            self._update_article_simhash(article["id"], simhash)

            # Check for similar articles using LSH
            similar = self.lsh.query(minhash)

            if similar:
                # Found similar article(s), add to existing cluster
                cluster_id = similar[0]  # Use first match's cluster
                self._assign_to_cluster(article["id"], cluster_id)
                articles_clustered += 1

                logger.info(
                    f"Article {article['id']} assigned to cluster {cluster_id}",
                    article_id=article["id"],
                    cluster_id=cluster_id,
                )
            else:
                # No similar articles, create new cluster
                cluster_id = self._create_cluster(article["id"])
                self.lsh.insert(cluster_id, minhash)
                clusters_created += 1

                logger.info(
                    f"Created new cluster {cluster_id} for article {article['id']}",
                    article_id=article["id"],
                    cluster_id=cluster_id,
                )

        return {
            "articles_processed": len(articles),
            "articles_clustered": articles_clustered,
            "clusters_created": clusters_created,
        }

    def _fetch_articles(self, article_ids: list[str]) -> list[dict[str, Any]]:
        """
        Fetch articles from database (limited to last 48 hours per spec)
        """
        placeholders = ",".join(["%s"] * len(article_ids))
        query = f"""
        SELECT id, title, summary_raw, ts_published, source_id
        FROM articles
        WHERE id IN ({placeholders})
          AND ts_published >= NOW() - INTERVAL '48 hours'
        ORDER BY ts_published DESC
        """

        return execute_query(query, tuple(article_ids))

    def _update_article_simhash(self, article_id: str, simhash: str) -> None:
        """
        Update article with computed SimHash
        """
        query = """
        UPDATE articles
        SET simhash = %s, updated_at = NOW()
        WHERE id = %s
        """

        execute_update(query, (simhash, article_id))

    def _create_cluster(self, article_id: str) -> str:
        """
        Create a new cluster with the article as representative
        """
        query = """
        INSERT INTO clusters (id, rep_article_id, created_at, updated_at)
        VALUES (%s, %s, NOW(), NOW())
        RETURNING id
        """

        with get_cursor() as cursor:
            # Generate a string ID since Prisma schema uses String @id (cuid-like)
            cluster_id = str(uuid.uuid4())
            cursor.execute(query, (cluster_id, article_id))
            result = cursor.fetchone()
            # Prefer DB-returned id in case of DB-side defaults (should match inserted value)
            cluster_id = result["id"] if result and result.get("id") else cluster_id

            # Assign article to cluster within the same transaction/connection
            update_article_query = """
            UPDATE articles
            SET cluster_id = %s, updated_at = NOW()
            WHERE id = %s
            """
            cursor.execute(update_article_query, (cluster_id, article_id))

            return cluster_id

    def _assign_to_cluster(self, article_id: str, cluster_id: str) -> None:
        """
        Assign article to an existing cluster
        """
        query = """
        UPDATE articles
        SET cluster_id = %s, updated_at = NOW()
        WHERE id = %s
        """

        execute_update(query, (cluster_id, article_id))

        # Recompute representative article based on longest content and highest trust score
        self._recompute_representative(cluster_id)

    def _recompute_representative(self, cluster_id: str) -> None:
        """
        Recompute the representative article for the cluster using:
        - Longest content (content length, fallback to summary_raw, then title)
        - Highest source trust score as tiebreaker
        - Most recent publish time as final tiebreaker
        """
        select_query = """
        SELECT a.id
        FROM articles a
        LEFT JOIN sources s ON s.id = a.source_id
        WHERE a.cluster_id = %s
        ORDER BY
          COALESCE(LENGTH(a.content), LENGTH(a.summary_raw), LENGTH(a.title), 0) DESC,
          COALESCE(s.trust_score, 0) DESC,
          a.ts_published DESC
        LIMIT 1
        """

        with get_cursor() as cursor:
            cursor.execute(select_query, (cluster_id,))
            row = cursor.fetchone()
            if not row or not row.get("id"):
                return

            rep_id = row["id"]
            update_query = """
            UPDATE clusters
            SET rep_article_id = %s,
                updated_at = NOW()
            WHERE id = %s
            """
            cursor.execute(update_query, (rep_id, cluster_id))


if __name__ == "__main__":
    # Run the worker
    worker = DeduplicationWorker()
    worker.start()
