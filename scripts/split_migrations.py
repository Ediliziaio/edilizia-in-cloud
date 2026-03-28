#!/usr/bin/env python3
"""
Split multi-statement Supabase migration files into single-statement files.
Each split file gets a unique timestamp (original + 1 second per statement).
Validates no timestamp collisions with existing migrations.
"""

import os
import re
import sys

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
MIN_TIMESTAMP = '20260218'


def parse_statements(sql: str) -> list[str]:
    """Split SQL into top-level statements, respecting dollar-quoting."""
    statements = []
    in_dollar_quote = False
    dollar_tag = ''
    pos = 0
    stmt_start = 0
    text = sql

    while pos < len(text):
        if text[pos] == '$':
            match = re.match(r'\$([a-zA-Z_]*)\$', text[pos:])
            if match:
                tag = match.group(0)
                if not in_dollar_quote:
                    in_dollar_quote = True
                    dollar_tag = tag
                    pos += len(tag)
                    continue
                elif tag == dollar_tag:
                    in_dollar_quote = False
                    dollar_tag = ''
                    pos += len(tag)
                    continue

        if not in_dollar_quote and text[pos:pos+2] == '--':
            newline = text.find('\n', pos)
            pos = len(text) if newline == -1 else newline + 1
            continue

        if not in_dollar_quote and text[pos:pos+2] == '/*':
            end = text.find('*/', pos + 2)
            pos = len(text) if end == -1 else end + 2
            continue

        if not in_dollar_quote and text[pos] == ';':
            stmt = text[stmt_start:pos+1].strip()
            if stmt and stmt != ';':
                statements.append(stmt)
            stmt_start = pos + 1
            pos += 1
            continue

        pos += 1

    remaining = text[stmt_start:].strip()
    if remaining:
        lines = [l.strip() for l in remaining.split('\n') if l.strip()]
        non_comment = [l for l in lines if not l.startswith('--')]
        if non_comment:
            statements.append(remaining)

    return statements


def increment_timestamp(ts: str, n: int) -> str:
    """Increment a YYYYMMDDHHMMSS timestamp by n seconds."""
    from datetime import datetime, timedelta
    dt = datetime.strptime(ts, '%Y%m%d%H%M%S')
    dt += timedelta(seconds=n)
    return dt.strftime('%Y%m%d%H%M%S')


def main():
    migrations_dir = os.path.abspath(MIGRATIONS_DIR)
    if not os.path.isdir(migrations_dir):
        print(f"Error: {migrations_dir} not found")
        sys.exit(1)

    files = sorted(f for f in os.listdir(migrations_dir)
                   if f.endswith('.sql') and f[:8] >= MIN_TIMESTAMP[:8])

    # Collect all existing timestamps
    existing_timestamps = set()
    for f in os.listdir(migrations_dir):
        if f.endswith('.sql'):
            ts = f.split('_')[0]
            if ts.isdigit() and len(ts) == 14:
                existing_timestamps.add(ts)

    total_split = 0
    total_created = 0
    new_timestamps = set()  # Track what we're creating

    for fname in files:
        filepath = os.path.join(migrations_dir, fname)
        if not os.path.exists(filepath):
            continue

        # Extract timestamp and name suffix
        parts = fname.split('_', 1)
        timestamp = parts[0]
        if not timestamp.isdigit() or len(timestamp) != 14:
            continue

        name_suffix = parts[1] if len(parts) > 1 else 'migration.sql'
        name_suffix_no_ext = name_suffix.rsplit('.', 1)[0]

        with open(filepath, 'r') as f:
            content = f.read()

        stmts = parse_statements(content)
        if len(stmts) <= 1:
            continue

        # Check we have room: next N-1 timestamps must be free
        can_split = True
        for i in range(1, len(stmts)):
            new_ts = increment_timestamp(timestamp, i)
            if new_ts in existing_timestamps or new_ts in new_timestamps:
                # Collision! Try offset by 100 seconds
                print(f"  WARNING: Collision at {new_ts} for {fname}, trying offset")
                can_split = False
                break

        if not can_split:
            # Skip this file - needs manual handling
            print(f"  SKIP {fname}: timestamp collision")
            continue

        # Split: keep first statement in original file
        with open(filepath, 'w') as f:
            f.write(stmts[0] + '\n')

        # Create new files for remaining statements
        created = 0
        for i, stmt in enumerate(stmts[1:], 1):
            new_ts = increment_timestamp(timestamp, i)
            new_name = f"{new_ts}_{name_suffix_no_ext}_part{i}.sql"
            new_path = os.path.join(migrations_dir, new_name)

            with open(new_path, 'w') as f:
                f.write(stmt + '\n')

            new_timestamps.add(new_ts)
            created += 1

        total_split += 1
        total_created += created
        print(f"  Split {fname}: {len(stmts)} stmts -> {created + 1} files")

    all_files = sorted(f for f in os.listdir(migrations_dir) if f.endswith('.sql'))
    print(f"\nDone: {total_split} files split, {total_created} new files created")
    print(f"Total migration files: {len(all_files)}")


if __name__ == '__main__':
    main()
