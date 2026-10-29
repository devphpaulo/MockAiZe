from pathlib import Path
import time


def cleanup_temporary(temporary):
    """Retry only transient Windows locks inside the isolated test workspace."""
    root = Path(__file__).resolve().parents[1] / '.test-runtime'
    if not Path(temporary.name).resolve().is_relative_to(root.resolve()):
        raise RuntimeError('Temporary test directory escaped the workspace.')
    for attempt in range(5):
        try:
            temporary.cleanup()
            return
        except OSError as exc:
            if getattr(exc, 'winerror', None) not in {32, 145} or attempt == 4:
                raise
            time.sleep(0.1 * (attempt + 1))
