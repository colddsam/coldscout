"""
Custom exception types for the Cold Scout application.

Centralised exception hierarchy so modules can signal specific failure modes
(e.g. API quota exhaustion) to callers without relying on generic Exception
types that silently swallow actionable errors.
"""


class QuotaExceededException(Exception):
    """Raised when an external API returns a quota or authentication error.

    Distinguishes 429 (rate-limited), 401 (unauthenticated), and 403
    (forbidden / invalid key) responses from ordinary "no results" outcomes,
    allowing the pipeline scheduler to pause the current job and alert
    administrators rather than silently burning through remaining targets.

    Attributes:
        status_code: The HTTP status code that triggered the exception.
        message:     Human-readable description including the API body excerpt.
    """

    def __init__(self, status_code: int, message: str = ""):
        self.status_code = status_code
        self.message = message
        super().__init__(f"API quota/auth error (HTTP {status_code}): {message}")
