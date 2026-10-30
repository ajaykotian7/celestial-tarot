import random

import pytest

from kaudi import AYAS, HANDFUL, HEAPS, cast_kaudi, kaudi_tool


@pytest.mark.parametrize("seed", range(40))
def test_cast_splits_a_handful_into_three_heaps(seed):
    random.seed(seed)
    cast = cast_kaudi()
    heaps = cast["heaps"]
    assert [h["position"] for h in heaps] == HEAPS
    assert sum(h["count"] for h in heaps) == cast["cowries"]
    assert HANDFUL[0] <= cast["cowries"] <= HANDFUL[1]
    for h in heaps:
        assert h["count"] >= 1
        # Counted away in eights: a full last eight leaves 8, not 0
        assert h["remainder"] == (h["count"] % 8 or 8)
        assert h["aya"] == AYAS[h["remainder"]][0]
        assert h["favourable"] is (h["remainder"] % 2 == 1)
    assert cast["leaning"]


def test_kaudi_tool_schema():
    assert kaudi_tool["function"]["name"] == "cast_kaudi"
    assert kaudi_tool["function"]["parameters"]["properties"] == {}
