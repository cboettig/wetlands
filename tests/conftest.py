"""
pytest configuration for MCP server tests.
"""

import pytest


def pytest_configure(config):
    """Configure pytest with custom markers."""
    config.addinivalue_line(
        "markers", "asyncio: mark test as async"
    )
    config.addinivalue_line(
        "markers", "slow: mark test as slow running"
    )


# Make all async tests use asyncio by default
pytest_plugins = ('pytest_asyncio',)
