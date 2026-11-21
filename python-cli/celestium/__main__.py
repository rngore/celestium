"""Allow running via `python3 -m celestium`."""

import sys
from .cli import main

if __name__ == "__main__":
    sys.exit(main())
