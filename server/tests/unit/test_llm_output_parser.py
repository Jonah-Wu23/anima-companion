from __future__ import annotations

from app.services.dialogue.llm_output_parser import parse_labeled_response


def test_parse_labeled_response_with_valid_labels() -> None:
    payload = """
    [assistant]今天也要按时吃饭。[/assistant]
    [emotion]happy[/emotion]
    [animation]speak[/animation]
    [relationship_delta]{"trust": 2, "reliance": 1, "fatigue": -1}[/relationship_delta]
    [memory_writes][{"key":"饮食","value":"你喜欢清淡","type":"preference"}][/memory_writes]
    """

    parsed = parse_labeled_response(payload)

    assert parsed["assistant_text"] == "今天也要按时吃饭。"
    assert parsed["emotion"] == "happy"
    assert parsed["animation"] == "speak"
    assert parsed["relationship_delta"] == {"trust": 2, "reliance": 1, "fatigue": -1}
    assert parsed["memory_writes"] == [
        {"key": "饮食", "value": "你喜欢清淡", "type": "preference"}
    ]


def test_parse_labeled_response_fallback_on_invalid_fields() -> None:
    payload = """
    {"assistant_text":"先喝点水。","emotion":"invalid","animation":"dance",
     "relationship_delta":"bad-json","memory_writes":"oops"}
    """

    parsed = parse_labeled_response(payload)

    assert parsed["assistant_text"] == "先喝点水。"
    assert parsed["emotion"] == "neutral"
    assert parsed["animation"] == "speak"
    assert parsed["relationship_delta"] == {"trust": 0, "reliance": 0, "fatigue": 0}
    assert parsed["memory_writes"] == []
