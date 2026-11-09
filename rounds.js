// Ready-made quick rounds, written in the same text format the editor uses:
//   TRUE: statement            FALSE: statement          (true or false)
//   ? question                 then  * right option  /  - wrong option   (pick one; options can be image links)
//   MATCH: instruction         then  left = right  (one pair per line; left can be an image link)
//   > note                     an explanation shown after answering, for the item above it
export const ROUNDS = {
  facts: {
    name: '10 true or false facts',
    prompt: 'True or false? 10 quick ones',
    text: `TRUE: Wombat poop is cube-shaped.
> Wombats really do produce cube-shaped droppings, and they stack them to mark their territory.

FALSE: A goldfish has a memory of about three seconds.
> Goldfish can remember things for months and can even be trained.

TRUE: An octopus has three hearts.
> Two pump blood through the gills, one through the rest of the body.

FALSE: The Great Wall of China is visible from the Moon with the naked eye.
> It's far too narrow. Even from low orbit it's very hard to spot.

TRUE: Scotland's national animal is the unicorn.
> It has been a Scottish symbol since the 1300s.

FALSE: Bulls get angry when they see the colour red.
> Bulls are red-green colour-blind. It's the cape's movement that sets them off.

TRUE: Sweden has more than 250 000 islands.
> A 2013 count found 267 570 islands, more than any other country.

FALSE: Napoleon was unusually short.
> He was around 1.69 m, about average for a Frenchman of his time. The myth comes partly from French vs English inches.

TRUE: The Eiffel Tower gets slightly taller in summer.
> The iron expands in the heat, adding up to about 15 cm.

TRUE: The name IKEA comes from the founder's initials, his family farm and his home village.
> Ingvar Kamprad, Elmtaryd, Agunnaryd.`,
  },
  inventors: {
    name: 'Match the Swede to the invention',
    prompt: 'Match each Swede to what they invented',
    text: `MATCH: Match each Swede to their invention
Alfred Nobel = Dynamite
Anders Celsius = The Celsius temperature scale
Nils Bohlin = The three-point seat belt
Ruben Rausing = The Tetra Pak milk carton
Johan Petter Johansson = The adjustable wrench
Rune Elmqvist = The implantable pacemaker
> Bohlin designed the seat belt at Volvo in 1959, and Volvo let every carmaker use the patent for free.`,
  },
  headlines: {
    name: 'Real or fake headlines',
    prompt: 'Spot the real headline: only one in each group actually happened',
    text: `? Which of these headlines is real?
* Swedish man arrested for trying to split atoms in his kitchen
- Swedish man arrested for building a working rocket in his allotment shed
- Swedish man fined for keeping a moose as a pet in his apartment
> Richard Handl from Ängelholm, 2011. He wrote about the experiment in a blog.

? Which of these headlines is real?
- Iceland's coast guard appoints a puffin as honorary lighthouse inspector
* Penguin knighted by the Norwegian King's Guard
- Danish zoo gives a polar bear honorary citizenship
> Sir Nils Olav at Edinburgh Zoo was knighted in 2008 and has since been promoted to Major General.

? Which of these headlines is real?
- Finnish company gives staff an extra week off for using the sauna together
- German firm pays employees a bonus for every day they bike to work in the rain
* Japanese company gives non-smokers six extra days of holiday
> Piala Inc in Tokyo, 2017, to make up for the time smokers spent on smoke breaks.

? Which of these headlines is real?
* Swedish parents try to name their son "Brfxxccxxmnpcccclllmmnprxvclmnckssqlbb11116"
- Norwegian parents win the right to name their daughter "Wi-Fi"
- Danish couple names their twins "Ctrl" and "Alt"
> 1996, in protest against Sweden's naming law. The name was rejected, and so was their next try, "A".

? Which of these headlines is real?
- Australian town's council outvoted by a flock of cockatoos in online poll
* Australian army "loses" a war against emus
- New Zealand declares war on its own sheep after farm protests
> The Great Emu War of 1932: soldiers with machine guns failed to stop around 20 000 emus.`,
  },
};

// ---------- the text format ----------
const isImg = (s) => /^https:\/\/\S+$/i.test(s);
export function parseRound(text) {
  const items = [];
  let cur = null;
  const errors = [];
  String(text || '').split('\n').forEach((raw, n) => {
    const line = raw.trim();
    if (!line) { cur = cur && cur.t === 'match' ? null : cur; return; }
    let m;
    if ((m = line.match(/^(TRUE|FALSE)\s*:\s*(.+)$/i))) { cur = { t: 'tf', text: m[2].trim(), answer: m[1].toUpperCase() === 'TRUE' }; items.push(cur); return; }
    if ((m = line.match(/^\?\s*(.+)$/))) { cur = { t: 'pick', text: m[1].trim(), options: [], answer: null }; items.push(cur); return; }
    if ((m = line.match(/^MATCH\s*:\s*(.*)$/i))) { cur = { t: 'match', text: m[1].trim() || 'Match them up', pairs: [] }; items.push(cur); return; }
    if ((m = line.match(/^>\s*(.+)$/))) { if (cur) cur.note = m[1].trim(); else errors.push(`Line ${n + 1}: a note needs an item above it`); return; }
    if ((m = line.match(/^([*-])\s*(.+)$/)) && cur?.t === 'pick') {
      cur.options.push(m[2].trim());
      if (m[1] === '*') { if (cur.answer) errors.push(`Line ${n + 1}: only one right answer (*) per question`); cur.answer = m[2].trim(); }
      return;
    }
    if ((m = line.match(/^(.+?)\s*=\s*(.+)$/)) && cur?.t === 'match') { cur.pairs.push([m[1].trim(), m[2].trim()]); return; }
    errors.push(`Line ${n + 1} isn't understood: "${line.slice(0, 40)}"`);
  });
  items.forEach((it, k) => {
    if (it.t === 'pick' && (!it.answer || it.options.length < 2)) errors.push(`Item ${k + 1}: a pick-one question needs 2+ options and one marked with *`);
    if (it.t === 'pick' && new Set(it.options).size !== it.options.length) errors.push(`Item ${k + 1}: the options must all be different`);
    if (it.t === 'match' && (it.pairs.length < 2 || it.pairs.length > 8)) errors.push(`Item ${k + 1}: matching needs 2 to 8 pairs`);
    if (it.t === 'match' && new Set(it.pairs.map((p) => p[1])).size !== it.pairs.length) errors.push(`Item ${k + 1}: the right-hand side must all be different`);
  });
  if (!items.length) errors.push('The round has no items yet');
  if (items.length > 15) errors.push('A round has at most 15 items');
  return { items, errors };
}
export function roundToText(meta) {
  return (meta?.items || []).map((it) => {
    const note = it.note ? `\n> ${it.note}` : '';
    if (it.t === 'tf') return `${it.answer ? 'TRUE' : 'FALSE'}: ${it.text}${note}`;
    if (it.t === 'pick') return `? ${it.text}\n${it.options.map((o) => `${o === it.answer ? '*' : '-'} ${o}`).join('\n')}${note}`;
    return `MATCH: ${it.text}\n${it.pairs.map(([l, r]) => `${l} = ${r}`).join('\n')}${note}`;
  }).join('\n\n');
}
export { isImg };
