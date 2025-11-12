"""Test configuration for pytest."""

import pytest


@pytest.fixture
def sample_article():
    """Sample article fixture for testing."""
    return {
        "title": "Apple Stock Rises 5% on Strong Earnings",
        "content": "Apple Inc. reported strong quarterly earnings today...",
        "url": "https://example.com/article",
        "published": "2025-11-10T10:00:00Z",
    }
