"""Validate a saved report's schema, recorded evidence and optional frozen candidate."""
import argparse
from pathlib import Path

from evaluate import inventory, strict_json, validate_report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report")
    parser.add_argument("--candidate")
    args = parser.parse_args()
    path = Path(args.report).resolve()
    try:
        report = validate_report(strict_json(path), path.parent)
        if args.candidate and inventory(Path(args.candidate).resolve())[0] != report["candidate_sha256"]:
            raise ValueError("Report does not belong to this candidate")
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Report rejected: {exc}\n")
    print(f"Valid report; overall={report['overall']} (valid does not mean passing)")


if __name__ == "__main__":
    main()
