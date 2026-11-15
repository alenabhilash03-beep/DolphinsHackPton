/** Deposited heavy-atom geometry only. No docking, dynamics or energetic inference. */ export const STRUCTURES = {
    trastuzumab: {
        id: "1N8Z",
        sha256: "ed934d36503335c6764b08880f9e50933d99eb13b9bf145339cfcaee150eb21e",
        description: "Trastuzumab Fab–HER2 extracellular domain · X-ray, 2.52 Å",
        scope: "Antibody fragment and soluble target domain; not intact-antibody tissue geometry.",
        chains: [
            {
                id: "A",
                label: "Fab light chain",
                color: "#d6a64a"
            },
            {
                id: "B",
                label: "Fab heavy chain",
                color: "#bd7295"
            },
            {
                id: "C",
                label: "HER2 extracellular domain",
                color: "#4e9c9b"
            }
        ]
    },
    imatinib: {
        id: "1IEP",
        sha256: "577386b4b8bc58a570facba0c8a843386842caef5ed7b60106c685d0f68d4218",
        description: "Imatinib–mouse c-Abl kinase domain · X-ray, 2.1 Å",
        scope: "Two crystallographic copies, A and B. Mouse c-Abl domain, not human BCR-ABL cellular kinetics or intracellular exposure.",
        chains: [
            {
                id: "A",
                label: "Mouse c-Abl · crystal copy A",
                color: "#4e9c9b"
            },
            {
                id: "B",
                label: "Mouse c-Abl · crystal copy B",
                color: "#bd7295"
            }
        ]
    }
};
export function residueLabel(ref) {
    return `${ref.resi}${ref.icode}`;
}
export function residueKey(ref) {
    return `${ref.chain}:${residueLabel(ref)}:${ref.resn}`;
}
export function parseResidueLabel(text) {
    const match = /^(-?\d+)([A-Za-z]?)$/.exec(text.trim());
    if (!match) throw new Error("Use an author residue number, optionally followed by its insertion code (for example 100A).");
    const resi = Number(match[1]);
    if (!Number.isSafeInteger(resi)) throw new Error("Residue number is outside the supported range.");
    return {
        resi,
        icode: match[2].toUpperCase()
    };
}
export function parseCoordinates(pdb) {
    const atoms = [], unresolved = [];
    const seen = new Set();
    let modelStarted = false;
    for (const line of pdb.split(/\r?\n/)){
        if (line.startsWith("REMARK 465")) {
            const match = /^REMARK 465\s+(?:\d+\s+)?([A-Z0-9]{3})\s+([A-Za-z0-9])\s+(-?\d+)([A-Za-z]?)\s*$/.exec(line);
            if (match) unresolved.push({
                resn: match[1],
                chain: match[2],
                resi: Number(match[3]),
                icode: match[4]
            });
        }
        if (line.startsWith("MODEL ")) {
            if (modelStarted) break;
            modelStarted = true;
        }
        if (line.startsWith("ENDMDL")) break;
        const protein = line.startsWith("ATOM  ");
        if (!protein && !line.startsWith("HETATM")) continue;
        const element = line.slice(76, 78).trim().toUpperCase();
        if (!element) throw new Error("Atom element metadata missing; heavy-atom contacts cannot be verified.");
        if (element === "H" || element === "D") continue;
        if (line[16]?.trim()) throw new Error("Alternate conformers require explicit handling before inspection; none are mixed automatically.");
        function number(start, end) {
            const field = line.slice(start, end).trim();
            const value = Number(field);
            if (!field || !Number.isFinite(value)) throw new Error("Invalid deposited coordinate record.");
            return value;
        }
        const serial = number(6, 11), resi = number(22, 26);
        if (!Number.isInteger(serial) || !Number.isInteger(resi) || seen.has(serial)) throw new Error("Ambiguous deposited atom identifiers.");
        seen.add(serial);
        atoms.push({
            serial,
            chain: line[21],
            resi,
            icode: line.slice(26, 27).trim(),
            resn: line.slice(17, 20).trim(),
            atom: line.slice(12, 16).trim(),
            element,
            protein,
            x: number(30, 38),
            y: number(38, 46),
            z: number(46, 54)
        });
    }
    if (!atoms.length) throw new Error("No deposited heavy-atom coordinates found.");
    return {
        atoms,
        unresolved
    };
}
export function role(atom, kind) {
    if (kind === "trastuzumab") return atom.protein && atom.chain === "C" ? "target" : atom.protein && [
        "A",
        "B"
    ].includes(atom.chain) ? "drug" : null;
    return [
        "A",
        "B"
    ].includes(atom.chain) ? atom.protein ? "target" : atom.resn === "STI" ? "drug" : null : null;
}
export function partners(a, b, kind) {
    const left = role(a, kind), right = role(b, kind);
    return !!left && !!right && left !== right && (kind !== "imatinib" || a.chain === b.chain);
}
export function separation(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
/** Closest heavy-atom pair for each counterpart residue, sorted deterministically. */ export function residueContacts(atoms, selected, kind) {
    const own = atoms.filter((a)=>residueKey(a) === residueKey(selected));
    const best = new Map();
    for (const a of own)for (const b of atoms)if (partners(a, b, kind)) {
        const distance = separation(a, b), key = residueKey(b), old = best.get(key);
        if (!old || distance < old.distance) best.set(key, {
            a,
            b,
            distance
        });
    }
    return [
        ...best.values()
    ].sort((x, y)=>x.distance - y.distance || residueKey(x.b).localeCompare(residueKey(y.b)));
}
/** Spatial buckets avoid quadratic scanning of the complete antibody complex. */ export function interfaceContacts(atoms, kind, cutoff = 4) {
    if (!Number.isFinite(cutoff) || cutoff <= 0 || cutoff > 10) throw new Error("Choose a geometric cutoff above zero and at most 10 Å.");
    const grid = new Map();
    const cell = (a)=>[
            a.x,
            a.y,
            a.z
        ].map((v)=>Math.floor(v / cutoff));
    for (const atom of atoms.filter((a)=>role(a, kind) === "target")){
        const key = cell(atom).join(":");
        grid.set(key, [
            ...grid.get(key) ?? [],
            atom
        ]);
    }
    const best = new Map();
    for (const a of atoms.filter((a)=>role(a, kind) === "drug")){
        const [x, y, z] = cell(a);
        for(let i = -1; i <= 1; i++)for(let j = -1; j <= 1; j++)for(let k = -1; k <= 1; k++)for (const b of grid.get(`${x + i}:${y + j}:${z + k}`) ?? []){
            if (!partners(a, b, kind)) continue;
            const distance = separation(a, b);
            if (distance > cutoff) continue;
            const key = `${residueKey(a)}|${residueKey(b)}`, old = best.get(key);
            if (!old || distance < old.distance) best.set(key, {
                a,
                b,
                distance
            });
        }
    }
    return [
        ...best.values()
    ].sort((a, b)=>a.distance - b.distance || residueKey(a.a).localeCompare(residueKey(b.a)) || residueKey(a.b).localeCompare(residueKey(b.b)));
}
export const TOUR = [
    {
        title: "The deposited complex",
        description: "See the experimental assembly. Camera movement changes your view, never atomic positions."
    },
    {
        title: "Identify the binding partners",
        description: "Colors separate the drug or antibody fragment from its target. A crystal copy is not a second biological prediction."
    },
    {
        title: "Explore the interface",
        description: "Highlighted residues have deposited heavy atoms within 4 Å of the opposite binding partner. Waters and glycans are excluded."
    },
    {
        title: "Inspect coordinate geometry",
        description: "Inspect a coordinate-derived close pair in the sidebar. Proximity alone cannot establish an energetic interaction, affinity or kinetic rate."
    }
];
