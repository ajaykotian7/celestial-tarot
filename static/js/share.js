// Sharing: a reading as an image (for WhatsApp and the like) or as text, and a person's
// chart printed (or saved as PDF) for the family jyotishi.
import { toast, fmtDate, localDate } from "./util.js";

export function readingText(r) {
    const lines = [];
    if (r.personName) lines.push(`For ${r.personName}`);
    lines.push(`“${r.question}”`, "");
    if (r.cards?.length) lines.push(`Cards: ${r.cards.map((c) => c.card + (c.orientation === "reversed" ? " (reversed)" : "")).join(", ")}`);
    if (r.kaudi?.length) lines.push(`Cowries: ${r.kaudi.map((h) => h.aya).join(", ")}`);
    if (r.jataka) lines.push(`Dasha: ${r.jataka}`);
    if (r.tldr) lines.push("", r.tldr);
    if (r.reply) lines.push("", r.reply);
    lines.push("", "— Celestial");
    return lines.join("\n");
}

// Lines of text that fit a width
function wrap(ctx, text, width) {
    const lines = [];
    for (const paragraph of text.split("\n")) {
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
            const next = line ? `${line} ${word}` : word;
            if (ctx.measureText(next).width > width && line) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        lines.push(line);
    }
    return lines;
}

async function readingImage(r) {
    await document.fonts?.ready;
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const c = canvas.getContext("2d");
    const paper = "#f6efe2";
    const ink = "#2a1c13";
    const kumkum = "#b4351c";
    const haldi = "#d99a12";

    c.fillStyle = paper;
    c.fillRect(0, 0, W, H);
    // The pulli grid
    c.fillStyle = "rgba(42, 28, 19, 0.08)";
    for (let x = 30; x < W; x += 36) for (let y = 30; y < H; y += 36) c.fillRect(x, y, 3, 3);
    // A kumkum border with turmeric corners
    c.strokeStyle = kumkum;
    c.lineWidth = 6;
    c.strokeRect(40, 40, W - 80, H - 80);
    c.fillStyle = haldi;
    for (const [x, y] of [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]]) {
        c.beginPath();
        c.arc(x, y, 14, 0, Math.PI * 2);
        c.fill();
    }

    let y = 140;
    c.textAlign = "center";
    c.fillStyle = kumkum;
    c.font = "56px 'Rozha One', Georgia, serif";
    c.fillText("Celestial", W / 2, y);
    y += 50;
    c.fillStyle = "#6c5847";
    c.font = "30px Mukta, sans-serif";
    c.fillText([r.personName && `For ${r.personName}`, fmtDate(r.date || localDate())].filter(Boolean).join(" · "), W / 2, y);

    y += 90;
    c.fillStyle = ink;
    c.font = "italic 40px Mukta, sans-serif";
    for (const line of wrap(c, `“${r.question}”`, W - 220).slice(0, 4)) {
        c.fillText(line, W / 2, y);
        y += 54;
    }

    const read = [
        r.cards?.length && r.cards.map((x) => x.card).join(" · "),
        r.kaudi?.length && `Cowries: ${r.kaudi.map((h) => h.aya).join(" · ")}`,
        r.jataka && `Dasha: ${r.jataka}`,
    ].filter(Boolean);
    y += 20;
    c.fillStyle = kumkum;
    c.font = "600 30px Mukta, sans-serif";
    for (const line of read) {
        for (const part of wrap(c, line, W - 220)) {
            c.fillText(part, W / 2, y);
            y += 42;
        }
    }

    y += 40;
    c.textAlign = "left";
    c.fillStyle = ink;
    c.font = "44px Mukta, sans-serif";
    const body = r.tldr || r.reply || "";
    const lines = wrap(c, body, W - 220);
    const room = Math.floor((H - 160 - y) / 60);
    for (const line of lines.slice(0, room)) {
        c.fillText(line, 110, y);
        y += 60;
    }
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export async function shareReading(r) {
    try {
        const blob = await readingImage(r);
        const file = new File([blob], "reading.png", { type: "image/png" });
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: r.tldr || r.question });
            return;
        }
        if (navigator.share) {
            await navigator.share({ text: readingText(r) });
            return;
        }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "reading.png";
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 5000);
        toast("Saved the reading as an image");
    } catch (e) {
        if (e?.name !== "AbortError") toast("Couldn't share from this browser");
    }
}

export async function shareText(title, text) {
    try {
        if (navigator.share) return await navigator.share({ title, text });
        await navigator.clipboard.writeText(text);
        toast("Copied");
    } catch (e) {
        if (e?.name !== "AbortError") toast("Couldn't share from this browser");
    }
}

// Print a block of the page on its own (the browser offers "Save as PDF")
export function printNode(node) {
    const area = document.getElementById("print-area");
    area.replaceChildren(node.cloneNode(true));
    document.body.classList.add("printing");
    const done = () => {
        document.body.classList.remove("printing");
        area.replaceChildren();
        window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
    // Some mobile browsers never fire afterprint
    setTimeout(done, 60_000);
}
