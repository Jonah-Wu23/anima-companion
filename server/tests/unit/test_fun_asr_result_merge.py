from __future__ import annotations

from app.services.asr.fun_asr_realtime_client import FunASREvent, _merge_result_events


def test_merge_result_events_prefers_incremental_latest_partial() -> None:
    events = [
        FunASREvent(type="result", text="小白", sentence_end=False),
        FunASREvent(type="result", text="小白今天", sentence_end=False),
        FunASREvent(type="result", text="小白今天过得怎么", sentence_end=False),
        FunASREvent(type="result", text="小白今天过得怎么样", sentence_end=False),
    ]
    assert _merge_result_events(events) == "小白今天过得怎么样"


def test_merge_result_events_deduplicates_sentence_end_repeats() -> None:
    events = [
        FunASREvent(type="result", text="小白今天过得怎么", sentence_end=False),
        FunASREvent(type="result", text="小白今天过得怎么样", sentence_end=True),
        FunASREvent(type="result", text="小白今天过得怎么样", sentence_end=True),
    ]
    assert _merge_result_events(events) == "小白今天过得怎么样"


def test_merge_result_events_keeps_multi_sentence_without_overlap_duplication() -> None:
    events = [
        FunASREvent(type="result", text="小白今天过得怎么样。", sentence_end=True),
        FunASREvent(type="result", text="我们晚上一起吃饭吧。", sentence_end=True),
    ]
    assert _merge_result_events(events) == "小白今天过得怎么样。我们晚上一起吃饭吧。"
