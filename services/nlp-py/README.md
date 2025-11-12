# NLP Python Workers

NLP and deduplication workers for MorningPulse newsletter system.

## Features

- **Deduplication**: SimHash-based article clustering
- **Summarization**: Rule-based extractive summarization with numerical fact verification
- **NER**: Entity extraction for stocks, companies, industries

## Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux

# Install dependencies
pip install poetry
poetry install

# Download spaCy models
python -m spacy download en_core_web_sm
python -m spacy download zh_core_web_sm
```

## Development

```bash
# Format code
poetry run black src/

# Type check
poetry run mypy src/

# Run tests
poetry run pytest
```
