import sys
from unittest.mock import create_autospec

import pytest

from app.scripts import run_notifications as cli
from app.services.notifications import NotificationBatchResult


@pytest.mark.parametrize(("argv", "limit", "batch", "exit_code", "printed"), [
    ([], None, NotificationBatchResult(0, 0, 0, 0), 0, "scanned=0 sent=0 skipped=0 failed=0\n"),
    (["--limit", "3"], 3, NotificationBatchResult(3, 1, 1, 1, [5, 7]), 1,
     "scanned=3 sent=1 skipped=1 failed=1\nnotification_ids=5,7\n"),
])
def test_cli_runs_one_batch(monkeypatch, capsys, argv, limit, batch, exit_code, printed):
    run = create_autospec(cli.run_low_power_notifications, return_value=batch)
    monkeypatch.setattr(cli, "run_low_power_notifications", run)
    monkeypatch.setattr(sys, "argv", ["run_notifications", *argv])
    assert cli.main() == exit_code
    run.assert_called_once_with(limit=limit)
    assert capsys.readouterr().out == printed


def test_negative_cli_limit_does_not_send(monkeypatch):
    run = create_autospec(cli.run_low_power_notifications)
    monkeypatch.setattr(cli, "run_low_power_notifications", run)
    monkeypatch.setattr(sys, "argv", ["run_notifications", "--limit", "-1"])
    with pytest.raises(SystemExit) as exc:
        cli.main()
    assert exc.value.code == 2
    run.assert_not_called()
