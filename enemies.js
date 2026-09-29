/* R.E.P.O. enemies, v0.4.4.3. HP = EnemyHealth.health, damage = HurtCollider.playerDamage in the enemy
   prefab (empty when damage comes from code: explosions, throws, beams). Pools = EnemyDirector
   .enemiesDifficulty1..3 → EnemySetup. Icons are our own 24×24 stroke drawings. */
const ENEMY_DATA = (() => {
  const ENEMIES = {
    // ----- 1★ -----
    gnome: { name: "Gnome", tier: 1, hp: 20, dmg: [10],
      desc: "Ходят пачкой по 4 и долбят ценности. Хлипкие: хватит удара или броска.",
      icon: '<path d="M12 3 7 14h10z"/><circle cx="12" cy="17.5" r="3.5"/>' },
    tick: { name: "Tick", tier: 1, hp: 10, dmg: [], desc: "",
      icon: '<ellipse cx="12" cy="13" rx="5" ry="6"/><path d="M7 10 3 7M17 10l4-3M7 15l-4 2M17 15l4 2"/>' },
    peeper: { name: "Peeper", tier: 1, hp: 30, dmg: [],
      desc: "Глаз на потолке. Не смотри на него: взгляд притягивает и ранит.",
      icon: '<path d="M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' },
    spewer: { name: "Spewer", tier: 1, hp: 65, dmg: [10],
      desc: "Цепляется к лицу и блюёт. Сорви и ударь.",
      icon: '<circle cx="12" cy="10" r="7"/><path d="M8 11q4 4 8 0M10 17v4M14 17v3"/>' },
    apex: { name: "Apex Predator", tier: 1, hp: 150, dmg: [10],
      desc: "Утка ходит следом. Не трогай: после удара становится хищником.",
      icon: '<circle cx="9" cy="8" r="4"/><path d="M13 8h5l-3 2M5 12c0 5 4 8 9 8s6-3 6-6H9"/>' },
    birthday: { name: "Birthday Boy", tier: 1, hp: 150, dmg: [10], desc: "",
      icon: '<ellipse cx="12" cy="9" rx="5" ry="6"/><path d="M12 15l-1 2h2l-1-2v6"/>' },
    shadowchild: { name: "Shadow Child", tier: 1, hp: 150, dmg: [], desc: "",
      icon: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v13M12 11l-4 5M12 11l4 5"/>' },
    bella: { name: "Bella", tier: 1, hp: 200, dmg: [5], desc: "",
      icon: '<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M6 17l5-8h4l3 8M11 9V5h3"/>' },
    elsa: { name: "Elsa", tier: 1, hp: 600, dmg: [5], desc: "",
      icon: '<path d="M12 2v20M3 7l18 10M21 7 3 17"/>' },
    // ----- 2★ -----
    banger: { name: "Banger", tier: 2, hp: 50, dmg: [],
      desc: "Тройка бомбочек: подкатываются и взрываются. Отбегай.",
      icon: '<circle cx="11" cy="14" r="6"/><path d="M15 9l3-3M18 3v2M21 6h-2"/>' },
    upscream: { name: "Upscream", tier: 2, hp: 50, dmg: [2],
      desc: "Прыгает к лицу и кричит, оглушает.",
      icon: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="14.5" rx="3" ry="4"/><path d="M8 8h1M15 8h1"/>' },
    hidden: { name: "Hidden", tier: 2, hp: 100, dmg: [],
      desc: "Невидимка, выдаёт себя дыханием. Хватает и утаскивает игрока.",
      icon: '<circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/><path d="M9 12h.01M15 12h.01"/>' },
    animal: { name: "Animal", tier: 2, hp: 150, dmg: [2],
      desc: "Носится как бешеный и таранит. Урон слабый.",
      icon: '<circle cx="12" cy="15" r="4"/><circle cx="6" cy="9" r="2"/><circle cx="10" cy="5" r="2"/><circle cx="14" cy="5" r="2"/><circle cx="18" cy="9" r="2"/>' },
    chef: { name: "Chef", tier: 2, hp: 150, dmg: [10],
      desc: "Прыгает на игрока и бьёт ножом.",
      icon: '<path d="M7 13a4 4 0 1 1 2-7 4 4 0 0 1 6 0 4 4 0 1 1 2 7v6H7z"/><path d="M7 16h10"/>' },
    headgrab: { name: "Headgrab", tier: 2, hp: 150, dmg: [5], desc: "",
      icon: '<path d="M7 21v-8M7 13V6a1.5 1.5 0 0 1 3 0v5M10 11V4a1.5 1.5 0 0 1 3 0v7M13 11V5a1.5 1.5 0 0 1 3 0v8c0 5-3 8-6 8H9"/>' },
    gambit: { name: "Gambit", tier: 2, hp: 150, dmg: [], desc: "",
      icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>' },
    mentalist: { name: "Mentalist", tier: 2, hp: 150, dmg: [],
      desc: "Поднимает игроков и предметы в воздух и роняет.",
      icon: '<circle cx="12" cy="9" r="6"/><path d="M8 20h8M6 17h12"/>' },
    rugrat: { name: "Rugrat", tier: 2, hp: 150, dmg: [],
      desc: "Швыряет в игроков ценности.",
      icon: '<rect x="8" y="8" width="8" height="13" rx="2"/><path d="M10 8V5h4v3M11 3h2"/>' },
    bowtie: { name: "Bowtie", tier: 2, hp: 200, dmg: [],
      desc: "Кричит, и волна отбрасывает игроков. Прячься за стеной.",
      icon: '<path d="M3 7v10l9-5zM21 7v10l-9-5z"/>' },
    oogly: { name: "Oogly", tier: 2, hp: 200, dmg: [4], desc: "",
      icon: '<path d="M4 18c0-8 3-13 8-13s8 5 8 13z"/><circle cx="9" cy="11" r="1.5"/><circle cx="15" cy="11" r="1.5"/><circle cx="12" cy="15" r="1.5"/>' },
    hearthugger: { name: "Heart Hugger", tier: 2, hp: 300, dmg: [30], desc: "",
      icon: '<path d="M12 20s-8-5-8-11a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 6-8 11-8 11z"/>' },
    // ----- 3★ -----
    headman: { name: "Headman", tier: 3, hp: 250, dmg: [10],
      desc: "Летающая голова: гонится и кусает.",
      icon: '<circle cx="12" cy="11" r="7"/><path d="M9 10h.01M15 10h.01M9 15h6M12 18v3"/>' },
    reaper: { name: "Reaper", tier: 3, hp: 250, dmg: [10],
      desc: "Быстро бегает и рубит серией ударов.",
      icon: '<path d="M6 21 17 4M17 4c-5 0-9 2-11 6 4-2 8-2 11-2"/>' },
    clown: { name: "Clown", tier: 3, hp: 250, dmg: [10, 30],
      desc: "Стреляет лучом и бьёт ногой.",
      icon: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="13" r="2"/><path d="M9 9h.01M15 9h.01M2 9h3M19 9h3"/>' },
    huntsman: { name: "Huntsman", tier: 3, hp: 250, dmg: [100],
      desc: "Слепой, стреляет на звук и убивает с выстрела. Замри и не шуми.",
      icon: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>' },
    robe: { name: "Robe", tier: 3, hp: 250, dmg: [100],
      desc: "Преследует и убивает с удара. Держи дистанцию.",
      icon: '<path d="M12 3c-5 0-7 5-7 9v9h14v-9c0-4-2-9-7-9z"/><path d="M10 11h.01M14 11h.01"/>' },
    cleanup: { name: "Cleanup Crew", tier: 3, hp: 350, dmg: [20], desc: "",
      icon: '<path d="M14 3 8 15M5 15h8l-2 6H3z"/>' },
    loom: { name: "Loom", tier: 3, hp: 500, dmg: [100], desc: "",
      icon: '<path d="M4 21c0-9 3-17 8-17s8 8 8 17M8 21c0-6 2-10 4-10s4 4 4 10"/>' },
    trudge: { name: "Trudge", tier: 3, hp: 500, dmg: [20, 35, 100],
      desc: "Медленный, притягивает к себе. Удар булавой убивает.",
      icon: '<path d="M4 20 13 11"/><circle cx="16" cy="8" r="4"/><path d="M16 2v2M22 8h-2M20.2 3.8l-1.4 1.4"/>' },
  };

  const one = (id, tier, n = 1, extra = {}) => ({ id, tier, members: [[id, n]], ...extra });
  const group = (id, n) => ({ id: "g-" + id, tier: 3, members: [[id, n]], group: true });
  const SETUPS = [
    ...["tick", "peeper", "spewer", "apex", "birthday", "shadowchild", "bella", "elsa"].map(id => one(id, 1)),
    one("gnome", 1, 4),
    ...["rugrat", "animal", "upscream", "hidden", "chef", "bowtie", "mentalist", "gambit", "hearthugger", "headgrab", "oogly"].map(id => one(id, 2)),
    one("banger", 2, 3),
    ...["headman", "robe", "huntsman", "reaper", "clown", "trudge", "cleanup"].map(id => one(id, 3)),
    one("loom", 3, 1, { minLevel: 3 }),                     // EnemySetup: levelsCompleted ≥ 2
    group("animal", 3), group("bowtie", 3), group("mentalist", 3), group("hidden", 2), group("chef", 3),
    group("upscream", 3), group("rugrat", 3), group("peeper", 4), group("apex", 4), group("spewer", 4),
    group("shadowchild", 4), group("banger", 6), group("gnome", 10), group("gambit", 2), group("hearthugger", 2),
    group("tick", 5), group("birthday", 3), group("elsa", 3), group("headgrab", 3), group("oogly", 3), group("bella", 3),
  ];
  const GROUP_MAX_LEVEL = 3;   // EnemySetup levelsCompletedMax = 2; also needs 5+ runs played

  function enemyPool(tier, level, groupsAllowed) {
    return SETUPS.filter(s => s.tier === tier
      && (!s.minLevel || level >= s.minLevel)
      && (!s.group || (groupsAllowed && level <= GROUP_MAX_LEVEL)));
  }
  const oneShot = e => e.dmg.some(d => d >= 100);
  function setupLabel(s) {
    const [[id, n]] = s.members, name = ENEMIES[id].name;
    return s.group ? `Группа: ${n} × ${name}` : n > 1 ? `${name} ×${n}` : name;
  }
  return { ENEMIES, SETUPS, enemyPool, oneShot, setupLabel };
})();
if (typeof module === "object") module.exports = ENEMY_DATA;
