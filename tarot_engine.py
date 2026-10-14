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

# (upright, reversed) meanings for every rank of every suit.
MINOR_ARCANA_MEANINGS = {
    "wands": {
        "ace": (
            "Inspiration, new opportunity, creative spark, potential.",
            "Delays, lack of motivation, false starts.",
        ),
        "two": (
            "Planning, future vision, bold decisions, discovery.",
            "Fear of the unknown, poor planning, playing it safe.",
        ),
        "three": (
            "Expansion, foresight, progress, opportunities abroad.",
            "Setbacks, frustrated plans, lack of foresight.",
        ),
        "four": (
            "Celebration, homecoming, harmony, milestones reached.",
            "Instability at home, cancelled celebrations, transition.",
        ),
        "five": (
            "Conflict, competition, tension, clashing egos.",
            "Avoiding conflict, finding resolution, inner struggle.",
        ),
        "six": (
            "Victory, public recognition, success, confidence.",
            "Ego, fall from grace, lack of recognition.",
        ),
        "seven": (
            "Defending your position, perseverance, standing your ground.",
            "Overwhelm, giving up, feeling besieged.",
        ),
        "eight": (
            "Swift action, momentum, rapid progress, incoming news.",
            "Delays, frustration, scattered energy.",
        ),
        "nine": (
            "Resilience, persistence, guarded courage, the last stretch.",
            "Exhaustion, paranoia, stubborn defensiveness.",
        ),
        "ten": (
            "Burden, overcommitment, heavy responsibility.",
            "Releasing burdens, delegating, avoiding burnout.",
        ),
        "page": (
            "Enthusiasm, exploration, free spirit, exciting news.",
            "Hasty ideas, lack of direction, procrastination.",
        ),
        "knight": (
            "Energy, passion, adventure, impulsive action.",
            "Recklessness, haste, frustration, scattered drive.",
        ),
        "queen": (
            "Confidence, warmth, determination, vibrant charisma.",
            "Jealousy, insecurity, demanding behavior.",
        ),
        "king": (
            "Visionary leadership, boldness, entrepreneurial spirit.",
            "Impulsiveness, arrogance, unrealistic expectations.",
        ),
    },
    "cups": {
        "ace": (
            "New love, emotional awakening, compassion, creativity.",
            "Blocked emotions, emptiness, repressed feelings.",
        ),
        "two": (
            "Partnership, mutual attraction, unity, deep connection.",
            "Imbalance, broken communication, separation.",
        ),
        "three": (
            "Friendship, celebration, community, shared joy.",
            "Overindulgence, gossip, isolation from friends.",
        ),
        "four": (
            "Apathy, contemplation, missed opportunities, withdrawal.",
            "Renewed interest, seizing opportunity, acceptance.",
        ),
        "five": (
            "Loss, grief, regret, focusing on what is gone.",
            "Acceptance, moving on, finding peace after loss.",
        ),
        "six": (
            "Nostalgia, childhood memories, innocence, reunion.",
            "Living in the past, idealized memories, moving forward.",
        ),
        "seven": (
            "Many choices, illusion, wishful thinking, fantasy.",
            "Clarity, decisiveness, seeing through illusion.",
        ),
        "eight": (
            "Walking away, disillusionment, seeking deeper meaning.",
            "Fear of change, aimless drifting, staying too long.",
        ),
        "nine": (
            "Contentment, satisfaction, wishes fulfilled.",
            "Smugness, inner dissatisfaction, materialism.",
        ),
        "ten": (
            "Harmony, family happiness, emotional fulfillment.",
            "Broken harmony, misaligned values, disconnection at home.",
        ),
        "page": (
            "Creative opportunity, intuitive message, curiosity.",
            "Emotional immaturity, creative block, insecurity.",
        ),
        "knight": (
            "Romance, charm, following the heart, idealism.",
            "Moodiness, unrealistic expectations, jealousy.",
        ),
        "queen": (
            "Compassion, emotional security, intuition, care.",
            "Codependency, emotional insecurity, martyrdom.",
        ),
        "king": (
            "Emotional balance, diplomacy, calm wisdom.",
            "Emotional manipulation, volatility, coldness.",
        ),
    },
    "swords": {
        "ace": (
            "Clarity, breakthrough, truth, sharp new ideas.",
            "Confusion, miscommunication, clouded judgment.",
        ),
        "two": (
            "Difficult decision, stalemate, avoidance, guarded emotions.",
            "Indecision, information overload, the lesser of two evils.",
        ),
        "three": (
            "Heartbreak, grief, painful truth, sorrow.",
            "Healing, forgiveness, releasing pain.",
        ),
        "four": (
            "Rest, recovery, contemplation, retreat.",
            "Restlessness, burnout, forced return to action.",
        ),
        "five": (
            "Conflict, hollow victory, winning at all costs.",
            "Reconciliation, making amends, letting go of resentment.",
        ),
        "six": (
            "Transition, moving on, leaving turmoil behind.",
            "Resistance to change, unfinished business, feeling stuck.",
        ),
        "seven": (
            "Deception, strategy, getting away with something.",
            "Coming clean, troubled conscience, exposed schemes.",
        ),
        "eight": (
            "Feeling trapped, self-imposed limits, victim mentality.",
            "Self-acceptance, new perspective, release from restriction.",
        ),
        "nine": (
            "Anxiety, worry, sleepless nights, fear.",
            "Hope, reaching out for help, easing despair.",
        ),
        "ten": (
            "Painful ending, rock bottom, betrayal, finality.",
            "Recovery, regeneration, surviving the worst.",
        ),
        "page": (
            "Curiosity, new ideas, vigilance, thirst for knowledge.",
            "Gossip, hasty words, all talk and no action.",
        ),
        "knight": (
            "Ambition, fast action, assertive drive.",
            "Impulsiveness, aggression, burnout, lack of direction.",
        ),
        "queen": (
            "Clear boundaries, independence, honest perception.",
            "Coldness, bitterness, cruel honesty.",
        ),
        "king": (
            "Intellectual authority, truth, clear thinking, ethics.",
            "Manipulation, tyranny, abuse of power.",
        ),
    },
    "pentacles": {
        "ace": (
            "New financial opportunity, prosperity, manifestation.",
            "Lost opportunity, poor planning, scarcity mindset.",
        ),
        "two": (
            "Balance, adaptability, juggling priorities.",
            "Overcommitment, disorganization, financial strain.",
        ),
        "three": (
            "Teamwork, collaboration, skill, building together.",
            "Disharmony, poor teamwork, lack of effort.",
        ),
        "four": (
            "Security, saving, control, holding on tightly.",
            "Greed, materialism, learning to let go.",
        ),
        "five": (
            "Hardship, financial loss, isolation, worry.",
            "Recovery, spiritual comfort, the end of hardship.",
        ),
        "six": (
            "Generosity, charity, giving and receiving, fairness.",
            "Strings attached, debt, one-sided giving.",
        ),
        "seven": (
            "Patience, long-term vision, assessment, investment.",
            "Impatience, limited reward, wasted effort.",
        ),
        "eight": (
            "Craftsmanship, diligence, skill development, mastery.",
            "Perfectionism, lack of focus, uninspired work.",
        ),
        "nine": (
            "Abundance, self-sufficiency, luxury, independence.",
            "Overwork, financial setbacks, superficial success.",
        ),
        "ten": (
            "Wealth, legacy, family, long-term security.",
            "Financial failure, family disputes, loss of legacy.",
        ),
        "page": (
            "Ambition, studiousness, new venture, manifestation.",
            "Lack of progress, procrastination, missed lessons.",
        ),
        "knight": (
            "Hard work, routine, reliability, steady progress.",
            "Boredom, stagnation, laziness, perfectionism.",
        ),
        "queen": (
            "Nurturing, practicality, abundance, groundedness.",
            "Self-neglect, work-home imbalance, smothering.",
        ),
        "king": (
            "Wealth, security, discipline, business acumen.",
            "Greed, stubbornness, obsession with status.",
        ),
    },
}

MINOR_ARCANA = {
    f"{rank} of {suit}": {"upright": upright, "reversed": reversed_}
    for suit, ranks in MINOR_ARCANA_MEANINGS.items()
    for rank, (upright, reversed_) in ranks.items()
}

TAROT_DECK = {**MAJOR_ARCANA, **MINOR_ARCANA}


# Position names for each spread, in the order the cards are laid down.
SPREADS = {
    "single_card": ["The Message"],
    "past_present_future": ["Past Influences", "Current Situation", "Future Potential"],
    "situation_obstacle_advice": ["Core Situation", "The Obstacle", "Guiding Advice"],
    "celtic_cross": [
        "The Present",
        "The Challenge",
        "The Foundation",
        "The Recent Past",
        "The Crown",
        "The Near Future",
        "Your Stance",
        "Surrounding Influences",
        "Hopes and Fears",
        "The Outcome",
    ],
}


def card_display_name(key: str) -> str:
    return key.title().replace(" Of ", " of ")


def card_image_path(key: str) -> str:
    """Public-domain Rider-Waite-Smith art, served from static/cards/."""
    return f"/static/cards/{key.replace(' ', '-')}.webp"


def draw_spread(spread_type: str = "past_present_future") -> Dict[str, Any]:
    positions = SPREADS.get(spread_type)
    if positions is None:
        return {
            "status": "error",
            "message": f"Unknown spread_type '{spread_type}'. Use one of: {', '.join(SPREADS)}.",
        }

    drawn_keys = random.sample(list(TAROT_DECK.keys()), len(positions))
    cards = []
    for pos, key in zip(positions, drawn_keys):
        orientation = random.choice(["upright", "reversed"])
        cards.append(
            {
                "position": pos,
                "card": card_display_name(key),
                "orientation": orientation,
                "meaning": TAROT_DECK[key][orientation],
                "image": card_image_path(key),
            }
        )
    return {"status": "success", "spread_type": spread_type, "cards": cards}


def find_card(card: str) -> Optional[str]:
    """Resolve a card name to its deck key, or None if it is unknown or ambiguous."""
    c = " ".join(card.lower().split())
    if not c:
        return None
    for key in (c, f"the {c}"):
        if key in TAROT_DECK:
            return key
    matches = [k for k in TAROT_DECK if c in k]
    return matches[0] if len(matches) == 1 else None


def get_tarot_meaning(card: str, orientation: str = "upright") -> Dict[str, Any]:
    key = find_card(card)
    if key is None:
        return {
            "status": "error",
            "message": f"Unknown or ambiguous card name: '{card}'. "
            "Use a full name such as 'The Tower' or 'Five of Cups'.",
        }
    if orientation not in ("upright", "reversed"):
        orientation = "upright"
    return {
        "status": "success",
        "card": card_display_name(key),
        "orientation": orientation,
        "meaning": TAROT_DECK[key][orientation],
    }


tarot_tools = [
    {
        "type": "function",
        "function": {
            "name": "draw_spread",
            "description": (
                "Shuffles and draws cards for a reading, sized to the question. "
                "single_card (1 card): simple or yes/no questions, daily guidance. "
                "past_present_future (3): how a situation is unfolding over time. "
                "situation_obstacle_advice (3): a problem, dilemma or decision. "
                "celtic_cross (10): only for extremely deep or complex questions with many "
                "intertwined factors, such as a major life crossroads."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "spread_type": {"type": "string", "enum": list(SPREADS)},
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
