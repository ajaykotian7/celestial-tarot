import json
import random
from typing import Dict, Any, List, Optional

MAJOR_ARCANA = {
    "the fool": {
        "upright": "New beginnings, innocence, spontaneity, leap of faith.",
        "reversed": "Recklessness, fear of commitment, foolish risks.",
    },
    "the magician": {
        "upright": "Manifestation, resourcefulness, power, inspired action.",
        "reversed": "Manipulation, poor planning, untapped talent.",
    },
    "the high priestess": {
        "upright": "Intuition, sacred knowledge, subconscious mind, mystery.",
        "reversed": "Secrets, disconnected intuition, superficial focus.",
    },
    "the empress": {
        "upright": "Abundance, fertility, creativity, nurturing, sensuality.",
        "reversed": "Creative block, smothering, dependence.",
    },
    "the emperor": {
        "upright": "Authority, structure, stability, leadership, discipline.",
        "reversed": "Tyranny, rigidity, loss of control, lack of discipline.",
    },
    "the hierophant": {
        "upright": "Tradition, spiritual wisdom, institutions, alignment.",
        "reversed": "Rebellion, nonconformity, dogma, outdated beliefs.",
    },
    "the lovers": {
        "upright": "Harmonious union, core values alignment, decisive choices.",
        "reversed": "Disharmony, value misalignment, indecision.",
    },
    "the chariot": {
        "upright": "Willpower, determination, triumph over obstacles, drive.",
        "reversed": "Lack of direction, aggression, obstacles, feeling defeated.",
    },
    "strength": {
        "upright": "Courage, compassion, inner resilience, patience.",
        "reversed": "Self-doubt, raw vulnerability, weakness.",
    },
    "the hermit": {
        "upright": "Soul searching, introspection, inner guidance, solitude.",
        "reversed": "Isolation, loneliness, anti-social withdrawal.",
    },
    "wheel of fortune": {
        "upright": "Good luck, destiny, life cycles, decisive turning point.",
        "reversed": "Misfortune, unwelcome turn, resistance to change.",
    },
    "justice": {
        "upright": "Fairness, truth, law, cause and effect, integrity.",
        "reversed": "Unfairness, lack of accountability, dishonesty.",
    },
    "the hanged man": {
        "upright": "Surrender, new perspective, letting go, pause.",
        "reversed": "Stagnation, useless sacrifice, stalling.",
    },
    "death": {
        "upright": "Transformation, endings, letting go of the old, transition.",
        "reversed": "Resistance to change, lingering attachments.",
    },
    "temperance": {
        "upright": "Balance, moderation, patience, purpose, synergy.",
        "reversed": "Imbalance, excess, friction, impatience.",
    },
    "the devil": {
        "upright": "Shadow self, attachment, addiction, illusion of traps.",
        "reversed": "Reclaiming freedom, breaking addictions, revelation.",
    },
    "the tower": {
        "upright": "Sudden upheaval, broken illusions, wake-up call.",
        "reversed": "Averting disaster, delaying inevitable, fear of disruption.",
    },
    "the star": {
        "upright": "Hope, renewal, faith, inspiration, healing.",
        "reversed": "Despair, cynicism, lost faith, discouragement.",
    },
    "the moon": {
        "upright": "Illusion, unconscious fears, intuition, hidden truths.",
        "reversed": "Release of fear, clarity surfacing, dispelling deceit.",
    },
    "the sun": {
        "upright": "Joy, vitality, clarity, optimism, shared warmth.",
        "reversed": "Temporary gloom, dimmed optimism, unrealistic positivity.",
    },
    "judgement": {
        "upright": "Awakening, reckoning, higher purpose, clear absolution.",
        "reversed": "Harsh self-judgment, self-doubt, ignoring calling.",
    },
    "the world": {
        "upright": "Wholeness, completion, integration, achievement.",
        "reversed": "Incomplete closure, shortcuts, delays, stagnation.",
    },
}

SUITS = ["wands", "cups", "swords", "pentacles"]
RANKS = [
    "ace",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "page",
    "knight",
    "queen",
    "king",
]


def generate_deck():
    deck = dict(MAJOR_ARCANA)
    for s in SUITS:
        for r in RANKS:
            deck[f"{r} of {s}"] = {
                "upright": f"Abundant expression of {s.capitalize()} through the power of the {r.capitalize()}.",
                "reversed": f"Internal blockages, inverted lessons, or friction regarding {s.capitalize()}.",
            }
    return deck


TAROT_DECK = generate_deck()


def draw_three_card_spread(
    spread_type: str = "past_present_future", question: Optional[str] = None
) -> Dict[str, Any]:
    positions = ["Past Influences", "Current Situation", "Future Potential"]
    if spread_type == "situation_obstacle_advice":
        positions = ["Core Situation", "The Obstacle", "Guiding Advice"]

    drawn_keys = random.sample(list(TAROT_DECK.keys()), 3)
    cards = []
    for pos, key in zip(positions, drawn_keys):
        orientation = random.choice(["upright", "reversed"])
        cards.append(
            {
                "position": pos,
                "card": key.title(),
                "orientation": orientation,
                "meaning": TAROT_DECK[key][orientation],
            }
        )
    return {"status": "success", "cards": cards}


def get_tarot_meaning(card: str, orientation: str = "upright") -> Dict[str, Any]:
    c = card.lower().strip()
    data = TAROT_DECK.get(c)
    if not data:
        matched = next((k for k in TAROT_DECK if c in k), "the fool")
        data = TAROT_DECK[matched]
        c = matched
    return {
        "status": "success",
        "card": c.title(),
        "orientation": orientation,
        "meaning": data.get(orientation, data["upright"]),
    }


tarot_tools = [
    {
        "type": "function",
        "function": {
            "name": "draw_three_card_spread",
            "description": "Shuffles and draws 3 cards for any general reading, past/present/future inquiry, or situational advice.",
            "parameters": {
                "type": "object",
                "properties": {
                    "spread_type": {
                        "type": "string",
                        "enum": ["past_present_future", "situation_obstacle_advice"],
                    },
                    "question": {"type": "string"},
                },
                "required": ["spread_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_tarot_meaning",
            "description": "Look up meaning of a specific card.",
            "parameters": {
                "type": "object",
                "properties": {
                    "card": {"type": "string"},
                    "orientation": {"type": "string", "enum": ["upright", "reversed"]},
                },
                "required": ["card"],
            },
        },
    },
]
