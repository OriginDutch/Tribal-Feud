/**
 * Word lists for player and tribe names, in the style of a Dutch Tribal Wars server: handles,
 * first names with a year, silly casual names; a mix of Dutch and English. Nothing crude, no
 * real famous people or brands. Myth, history and plain words are fine.
 */

/** Strong one-word handles (pros). */
export const HANDLES = [
  'Vortex', 'Ragnar', 'Kaiserreich', 'Valkyr', 'Draconis', 'Nightfall', 'Ironclad', 'Warlord', 'Obsidian', 'Tempest',
  'Leviathan', 'Bastion', 'Onslaught', 'Maelstrom', 'Sentinel', 'Juggernaut', 'Reaper', 'Phalanx', 'Centurion', 'Templar',
  'Crusader', 'Vanguard', 'Overlord', 'Zenith', 'Eclipse', 'Inferno', 'Avalanche', 'Blizzard', 'Hurricane', 'Thunderclap',
  'Grimwald', 'Ravenclaw', 'Wolfsbane', 'Nightshade', 'Hellfire', 'Stormborn', 'Frostbite', 'Ashfall', 'Bloodmoon', 'Darkwood',
  'Valhalla', 'Asgard', 'Midgard', 'Fenrir', 'Odin', 'Tyr', 'Heimdall', 'Loki', 'Freya', 'Skadi',
  'Achilles', 'Leonidas', 'Hannibal', 'Spartacus', 'Brennus', 'Arminius', 'Vercingetorix', 'Attila', 'Saladin', 'Barbarossa',
  'Charlemagne', 'Ivar', 'Bjorn', 'Rollo', 'Harald', 'Canute', 'Olaf', 'Sigurd', 'Ulfric', 'Eirik',
  'Kratos', 'Ares', 'Hades', 'Zeus', 'Poseidon', 'Apollo', 'Hermes', 'Atlas', 'Titan', 'Kronos',
  'Specter', 'Phantom', 'Wraith', 'Shade', 'Revenant', 'Banshee', 'Goliath', 'Colossus', 'Behemoth', 'Hydra',
  'Basilisk', 'Chimera', 'Griffin', 'Manticore', 'Wyvern', 'Kraken', 'Cerberus', 'Minotaur', 'Gorgon', 'Phoenix',
  'Paladin', 'Warden', 'Ranger', 'Marauder', 'Raider', 'Corsair', 'Highlander', 'Berserker', 'Gladiator', 'Legionnaire',
  'Conqueror', 'Usurper', 'Tyrant', 'Emperor', 'Sovereign', 'Regent', 'Viceroy', 'Chancellor', 'Marshal', 'Commander',
  'Kingslayer', 'Dragonheart', 'Lionheart', 'Ironhide', 'Steelborn', 'Stonewall', 'Firebrand', 'Bloodaxe', 'Skullsplitter', 'Shieldwall',
  'Nemesis', 'Vendetta', 'Retribution', 'Oblivion', 'Armageddon', 'Apocalypse', 'Ragnarok', 'Genesis', 'Exodus', 'Requiem',
  'Kaiser', 'Tsaar', 'Sultan', 'Khan', 'Shogun', 'Daimyo', 'Pharaoh', 'Satrap', 'Jarl', 'Thane',
  'Stormvogel', 'Zeeleeuw', 'IJzervreter', 'Donderslag', 'Vuurspuwer', 'Grafdelver', 'Bergreus', 'Nachtwacht', 'Zwaardvis', 'Schaduwjager',
  'Wervelwind', 'Hagelstorm', 'Ijsbeer', 'Grijsaard', 'Kruisvaarder', 'Landheer', 'Stadhouder', 'Baljuw', 'Schout', 'Drost',
  'Noorderzon', 'Zuiderwind', 'Oostfries', 'Westerling', 'Dijkgraaf', 'Polderheer', 'Moerasreus', 'Veenkoning', 'Heideridder', 'Duinwolf',
] as const;

/** First half of CamelCase handles: IronFang, SilentStorm. */
export const ADJECTIVES = [
  'Iron', 'Steel', 'Silent', 'Dark', 'Black', 'Red', 'Crimson', 'Golden', 'Silver', 'Grim',
  'Mad', 'Wild', 'Savage', 'Brutal', 'Fierce', 'Swift', 'Hidden', 'Lost', 'Fallen', 'Rising',
  'Burning', 'Frozen', 'Bloody', 'Broken', 'Lonely', 'Ancient', 'Eternal', 'Holy', 'Unholy', 'Cursed',
  'Royal', 'Noble', 'Rogue', 'Rebel', 'Stone', 'Storm', 'Thunder', 'Shadow', 'Night', 'Blood',
  'Fire', 'Frost', 'Ice', 'Ash', 'Dust', 'Bone', 'Wolf', 'Bear', 'Raven', 'Dragon',
  'Lion', 'Viking', 'Spartan', 'Dutch', 'Northern', 'Southern', 'Eastern', 'Western', 'Mighty', 'Lucky',
  'Sneaky', 'Sly', 'Cunning', 'Wise', 'Old', 'Young', 'Little', 'Big', 'Grand', 'Great',
  'Last', 'First', 'Final', 'Mystic', 'Arcane', 'Wicked', 'Furious', 'Raging', 'Howling', 'Roaring',
  'Hollow', 'Pale', 'Grey', 'Scarlet', 'Emerald', 'Azure', 'Obsidian', 'Copper', 'Bronze', 'Rusty',
  'Feral', 'Primal', 'Lethal', 'Deadly', 'Toxic', 'Atomic', 'Cosmic', 'Electric', 'Turbo', 'Hyper',
  'Grumpy', 'Sleepy', 'Happy', 'Angry', 'Crazy', 'Lazy', 'Brave', 'Bold', 'Proud', 'Humble',
] as const;

/** Dutch ones, only combined with Dutch nouns: ZwarteRidder, DolleStier. */
export const ADJECTIVES_NL = ['Zwarte', 'Rode', 'Stille', 'Wilde', 'Grote', 'Kleine', 'Oude', 'Boze', 'Dolle', 'Snelle', 'Gouden', 'IJzeren', 'Grijze', 'Dappere', 'Slimme', 'Sterke', 'Laatste', 'Eerste', 'Donkere', 'Vrije'] as const;

/** Second half of CamelCase handles. */
export const NOUNS = [
  'Fang', 'Claw', 'Blade', 'Sword', 'Axe', 'Spear', 'Shield', 'Hammer', 'Arrow', 'Bow',
  'Storm', 'Thunder', 'Fire', 'Flame', 'Frost', 'Wind', 'Rain', 'Tide', 'Wave', 'Stone',
  'Wolf', 'Bear', 'Raven', 'Crow', 'Hawk', 'Eagle', 'Falcon', 'Lion', 'Tiger', 'Fox',
  'Boar', 'Bull', 'Stag', 'Viper', 'Cobra', 'Dragon', 'Wyrm', 'Hound', 'Jackal', 'Panther',
  'King', 'Queen', 'Prince', 'Knight', 'Lord', 'Baron', 'Duke', 'Warrior', 'Hunter', 'Slayer',
  'Rider', 'Raider', 'Reaper', 'Ranger', 'Archer', 'Smith', 'Monk', 'Priest', 'Druid', 'Shaman',
  'Heart', 'Soul', 'Mind', 'Fist', 'Hand', 'Eye', 'Skull', 'Bone', 'Blood', 'Spirit',
  'Legion', 'Horde', 'Clan', 'Army', 'Guard', 'Watch', 'Keep', 'Tower', 'Gate', 'Wall',
  'Crown', 'Throne', 'Banner', 'Helm', 'Gauntlet', 'Mace', 'Dagger', 'Lance', 'Pike', 'Scythe',
  'Moon', 'Sun', 'Star', 'Comet', 'Sky', 'Night', 'Dawn', 'Dusk', 'Shadow', 'Ghost',
  'Bandit', 'Outlaw', 'Pirate', 'Viking', 'Nomad', 'Pilgrim', 'Wanderer', 'Stranger', 'Exile', 'Rebel',
  'Bringer', 'Breaker', 'Crusher', 'Walker', 'Seeker', 'Keeper', 'Maker', 'Taker', 'Burner', 'Caller',
] as const;

export const NOUNS_NL = ['Ridder', 'Strijder', 'Jager', 'Krijger', 'Wolf', 'Beer', 'Valk', 'Raaf', 'Stier', 'Leeuw', 'Draak', 'Reus', 'Heer', 'Graaf', 'Koning', 'Smid', 'Boer', 'Vos', 'Arend', 'Zwaan', 'Hamer', 'Bijl', 'Speer', 'Storm', 'Donder', 'Vuist', 'Schild', 'Toren', 'Wachter', 'Ruiter'] as const;

/** For pros: the adjectives and nouns that make a clean handle (IronFang, not LonelyMaker). */
export const PRO_ADJECTIVES = ['Iron', 'Steel', 'Silent', 'Dark', 'Black', 'Red', 'Crimson', 'Golden', 'Silver', 'Grim', 'Savage', 'Swift', 'Fallen', 'Burning', 'Frozen', 'Blood', 'Storm', 'Thunder', 'Shadow', 'Night', 'Fire', 'Frost', 'Ash', 'Bone', 'Wolf', 'Raven', 'Dragon', 'Lion', 'Stone', 'Hollow', 'Scarlet', 'Obsidian', 'Feral', 'Primal', 'Lethal', 'Wild', 'Royal', 'Rogue', 'Ancient', 'Eternal', 'Cursed', 'Holy', 'Last', 'Pale', 'Grey'] as const;
export const PRO_NOUNS = ['Fang', 'Claw', 'Blade', 'Sword', 'Axe', 'Spear', 'Shield', 'Hammer', 'Arrow', 'Storm', 'Thunder', 'Flame', 'Frost', 'Wolf', 'Bear', 'Raven', 'Hawk', 'Eagle', 'Falcon', 'Lion', 'Viper', 'Dragon', 'Wyrm', 'Hound', 'King', 'Knight', 'Lord', 'Warrior', 'Hunter', 'Slayer', 'Rider', 'Reaper', 'Heart', 'Fist', 'Skull', 'Legion', 'Crown', 'Banner', 'Helm', 'Moon', 'Star', 'Shadow', 'Ghost', 'Warden', 'Guard', 'Breaker', 'Bringer', 'Seeker', 'Keeper', 'Born'] as const;

/** First names as people really use them on a Dutch server, plus some from around it. */
export const FIRST_NAMES = [
  'Henk', 'Jan', 'Piet', 'Kees', 'Klaas', 'Joop', 'Gerrit', 'Willem', 'Hendrik', 'Cor',
  'Bram', 'Daan', 'Sem', 'Lucas', 'Milan', 'Levi', 'Luuk', 'Thijs', 'Jesse', 'Finn',
  'Tim', 'Tom', 'Bas', 'Rick', 'Mark', 'Niels', 'Jeroen', 'Erik', 'Bart', 'Dennis',
  'Kevin', 'Mike', 'Stefan', 'Sander', 'Robin', 'Jasper', 'Joost', 'Koen', 'Ruben', 'Wouter',
  'Martijn', 'Maarten', 'Pieter', 'Frank', 'Patrick', 'Remco', 'Ronald', 'Arjan', 'Edwin', 'Marco',
  'Peter', 'Paul', 'Johan', 'Gert', 'Hans', 'Rob', 'Ron', 'Ruud', 'Wim', 'Ad',
  'Jos', 'Ton', 'Harm', 'Frits', 'Freek', 'Gijs', 'Hidde', 'Jelle', 'Sjoerd', 'Tjeerd',
  'Wiebe', 'Douwe', 'Jappie', 'Bauke', 'Sietse', 'Feike', 'Rintje', 'Hylke', 'Durk', 'Tjalling',
  'Teun', 'Stijn', 'Siem', 'Jens', 'Mees', 'Ties', 'Guus', 'Hugo', 'Max', 'Noah',
  'Sven', 'Lars', 'Mats', 'Floris', 'Pim', 'Olaf', 'Ivo', 'Job', 'Mick', 'Roy',
  'Jordy', 'Danny', 'Jimmy', 'Sjaak', 'Sjors', 'Bertus', 'Toon', 'Driekus', 'Harrie', 'Jo',
  'Anne', 'Sanne', 'Lisa', 'Emma', 'Julia', 'Sophie', 'Lotte', 'Eva', 'Femke', 'Iris',
  'Anouk', 'Fleur', 'Roos', 'Noor', 'Tess', 'Lieke', 'Maud', 'Isa', 'Sara', 'Lina',
  'Marieke', 'Annemiek', 'Ingrid', 'Petra', 'Monique', 'Sandra', 'Linda', 'Esther', 'Mirjam', 'Ellen',
  'Wilma', 'Truus', 'Joke', 'Riet', 'Ans', 'Greet', 'Nel', 'Bep', 'Corrie', 'Jannie',
  'Kim', 'Demi', 'Romy', 'Britt', 'Jill', 'Nina', 'Vera', 'Merel', 'Floor', 'Ilse',
  'Saskia', 'Mariska', 'Daphne', 'Chantal', 'Natasja', 'Kirsten', 'Wendy', 'Bianca', 'Yvonne', 'Marloes',
  'Mohammed', 'Ahmed', 'Youssef', 'Mehmet', 'Emre', 'Yusuf', 'Ayoub', 'Bilal', 'Hamza', 'Omar',
  'Fatima', 'Yasmine', 'Naima', 'Elif', 'Zeynep', 'Samira', 'Ilias', 'Rayan', 'Adam', 'Nour',
  'Dirk', 'Bennie', 'Frans', 'Jopie', 'Kobus', 'Leen', 'Marinus', 'Nico', 'Otto', 'Rinus',
  'Jack', 'James', 'Tommy', 'Bobby', 'Johnny', 'Billy', 'Charlie', 'Harry', 'Jake', 'Ryan',
  'Kyle', 'Tyler', 'Josh', 'Chris', 'Matt', 'Nick', 'Alex', 'Sam', 'Ben', 'Dan',
  'Hans-Peter', 'Jurgen', 'Klaus', 'Dieter', 'Uwe', 'Torsten', 'Lukas', 'Felix', 'Jonas', 'Moritz',
  'Pierre', 'Luc', 'Wout', 'Jef', 'Staf', 'Lieven', 'Bjorn', 'Kenny', 'Gunther', 'Dirkje',
] as const;

/** Titles for Sir-style names: SirFarmalot, GraafKoen. */
export const TITLES = ['Sir', 'Lord', 'Lady', 'Captain', 'Baron', 'Count', 'King', 'Queen', 'Dr', 'Meester', 'Graaf', 'Jonkheer', 'Koning', 'Opa', 'Oom', 'Tante', 'Ome', 'Heer', 'Prins', 'Ridder', 'Generaal', 'Kapitein'] as const;

/** What Sir/Lord/... is: SirFarmalot, LordOfTheFarm. */
export const TITLE_TAILS = [
  'Farmalot', 'Raidsalot', 'Nobleslot', 'Spamalot', 'Clicksalot', 'Snobsalot', 'Catapult', 'Barbarian', 'Pancake', 'Stroopwafel',
  'Bitterbal', 'Kaas', 'Frikandel', 'Hutspot', 'Klomp', 'Molen', 'Tulp', 'Polder', 'Haring', 'Pepernoot',
  'Oliebol', 'Hagelslag', 'Speculaas', 'Kroket', 'Patat', 'Snert', 'Zuurkool', 'Poffertje', 'Pindakaas', 'Drop',
  'Wolf', 'Beer', 'Draak', 'Haas', 'Kip', 'Geit', 'Varken', 'Koe', 'Eend', 'Mol',
] as const;

/** Where people say they are from: frieseboer, brabantsekrijger. */
export const PLACES = [
  'dutch', 'holland', 'friese', 'fryske', 'brabantse', 'limburgse', 'zeeuwse', 'groningse', 'drentse', 'twentse',
  'gelderse', 'utrechtse', 'hollandse', 'achterhoekse', 'veluwse', 'amsterdamse', 'rotterdamse', 'haagse', 'tilburgse', 'bossche',
  'eindhovense', 'nijmeegse', 'zwolse', 'leidse', 'delftse', 'haarlemse', 'bredase', 'maastrichtse', 'arnhemse', 'enschedese',
  'vlaamse', 'belgische', 'antwerpse', 'gentse', 'kempense', 'noorder', 'zuider', 'polder', 'dorps', 'stadse',
] as const;

/** What they are: frieseboer, dutchwarrior. */
export const ROLES = [
  'boer', 'krijger', 'ridder', 'jager', 'smid', 'koning', 'heer', 'baas', 'held', 'strijder',
  'warrior', 'knight', 'king', 'farmer', 'hunter', 'raider', 'slayer', 'lord', 'boy', 'girl',
  'jongen', 'meid', 'kerel', 'vent', 'gozer', 'man', 'vrouw', 'opa', 'oma', 'kampioen',
  'viking', 'beer', 'wolf', 'leeuw', 'tijger', 'adelaar', 'draak', 'reus', 'kabouter', 'piraat',
] as const;

/** Lowercase words casual players pick: koekiemonster12, xXsniperXx. */
export const SILLY = [
  'koekiemonster', 'kaaskop', 'frikandel', 'bitterbal', 'stroopwafel', 'kroketje', 'patatje', 'pannenkoek', 'poffertje', 'oliebol',
  'drop', 'hagelslag', 'pindakaas', 'appelflap', 'tompouce', 'kapsalon', 'mayonaise', 'snertje', 'boterham', 'tosti',
  'sniper', 'gamer', 'noob', 'pro', 'killer', 'master', 'legend', 'boss', 'beast', 'ninja',
  'pirate', 'zombie', 'robot', 'alien', 'wizard', 'goblin', 'troll', 'dwarf', 'elf', 'orc',
  'lolboy', 'loldude', 'gekkie', 'mafkees', 'sukkel', 'knuffelbeer', 'muppet', 'pino', 'bolleboos', 'durfal', 
  'skaterboy', 'voetballer', 'fifa', 'tractor', 'brommer', 'scooter', 'trekker', 'fietser', 'zwemmer',
  'tijger', 'leeuwtje', 'vosje', 'beertje', 'wolfje', 'draakje', 'eenhoorn', 'pony', 'hamster', 'cavia',
  'ikwinaltijd', 'ikbendebeste', 'nietschieten', 'gewoonik', 'zomaar', 'jaja', 'okdan', 'whatever', 'idk', 'nvm',
  'darklord', 'deathbringer', 'shadowhunter', 'firestarter', 'stormrider', 'nightwolf', 'icequeen', 'bloodraven', 'doomslayer', 'souleater',
  'kabouter', 'sinterklaas', 'kerstman', 'paashaas', 'kwibus', 'tandenfee', 'smurf', 'reus', 'heks', 'tovenaar',
] as const;

// --- tribes -----------------------------------------------------------------------

/** Tribe names as players make them, with the tag they would pick. */
export const TRIBES: readonly (readonly [string, string])[] = [
  ['Dutch Dragons', 'DD'], ['The Lost Ones', 'LOST'], ['Doom', 'DOOM'], ['Brothers in Arms', 'BIA'], ['Northern Wolves', 'NW'],
  ['De Zwarte Ridders', 'ZR'], ['Orde van de Eik', 'EIK'], ['Bloedbroeders', 'BLOED'], ['Iron Legion', 'IL'], ['The Fallen', 'FALL'],
  ['Kings of the North', 'KOTN'], ['Valhalla Warriors', 'VALH'], ['Ragnarok', 'RAGN'], ['Shadow Council', 'SC'], ['Blood Moon', 'BM'],
  ['De Polderbende', 'PB'], ['Kaaskoppen United', 'KU'], ['Oranje Boven', 'OB'], ['De Molenaars', 'MOL'], ['Dijkwerkers', 'DIJK'],
  ['Night Watch', 'NW!'], ['Phoenix Rising', 'PHX'], ['Death Squad', 'DS'], ['Elite Force', 'ELITE'], ['The Untouchables', 'UNT'],
  ['Wolfpack', 'WOLF'], ['Ravens of Odin', 'ROO'], ['Sons of Thunder', 'SOT'], ['Hammer and Anvil', 'H&A'], ['Steel Fist', 'SF'],
  ['Het Laatste Bastion', 'HLB'], ['De Vrije Boeren', 'VB'], ['Noorderlicht', 'NOORD'], ['Brabantse Bende', 'BB'], ['Friese Doorzetters', 'FD'],
  ['Limburgse Leeuwen', 'LL'], ['Zeeuwse Zeeleeuwen', 'ZZ'], ['Twentse Tijgers', 'TT'], ['Groningse Grizzlies', 'GG'], ['Amsterdamse Adelaars', 'AA'],
  ['Chaos Theory', 'CHAOS'], ['Apocalypse Now', 'APOC'], ['Black Sheep', 'BS'], ['Grey Wardens', 'GW'], ['Crimson Tide', 'CT'],
  ['The Last Stand', 'TLS'], ['No Mercy', 'NOM'], ['Silent Storm', 'SST'], ['Dragon Riders', 'DR'], ['Knights Templar', 'KT'],
  ['De Gebroeders', 'GEBR'], ['Vriendenclub', 'VC'], ['Gezellig Samen', 'GZ'], ['Boerenbond', 'BOER'], ['Het Ridderschap', 'RS'],
  ['Pannenkoekenclub', 'PANNE'], ['Stroopwafel Syndicaat', 'SWS'], ['Team Bitterbal', 'TBB'], ['Oliebollenbrigade', 'OBB'], ['Kroketten Kartel', 'KK'],
  ['Anarchy', 'ANA'], ['Rebellion', 'REB'], ['Insurrection', 'INS'], ['Revolution', 'REV'], ['Dominion', 'DOM'],
  ['Empire', 'EMP'], ['Imperium', 'IMP'], ['Hegemony', 'HEG'], ['Dynasty', 'DYN'], ['Conquest', 'CONQ'],
  ['Spartans', 'SPA'], ['Romans', 'ROM'], ['Vikings', 'VIK'], ['Saxons', 'SAX'], ['Franks', 'FRK'],
  ['Goths', 'GOTH'], ['Vandals', 'VAN'], ['Huns', 'HUN'], ['Celts', 'CELT'], ['Bataven', 'BAT'],
  ['Friezen', 'FRIES'], ['Kelten', 'KELT'], ['Germanen', 'GERM'], ['Noormannen', 'NOOR'], ['Kruisvaarders', 'KRUIS'],
  ['Wild Hunt', 'HUNT'], ['Storm Bringers', 'STORM'], ['Ash and Ember', 'A&E'], ['Frost Giants', 'FROST'], ['Fire Lords', 'FIRE'],
  ['Cursed Blades', 'CB'], ['Holy Order', 'HO'], ['Unholy Alliance', 'UA'], ['Twilight Guard', 'TG'], ['Dawn Breakers', 'DAWN'],
  ['Noob Patrol', 'NOOB'], ['Farm Fanatics', 'FARM'], ['Barbarian Bashers', 'BASH'], ['Snob Squad', 'SNOB'], ['Catapult Crew', 'CATA'],
  ['Late Night Raiders', 'LNR'], ['Morning Coffee', 'MC'], ['Weekend Warriors', 'WW'], ['Overtime', 'OT'], ['Night Shift', 'NS'],
  ['Mammoet', 'MAM'], ['Kraken', 'KRAK'], ['Leviathan', 'LEVI'], ['Behemoth', 'BEHE'], ['Titans', 'TITAN'],
  ['De Onverzettelijken', 'ONV'], ['De Ijzervreters', 'IJZER'], ['Het Zwarte Woud', 'WOUD'], ['De Grijze Valken', 'VALK'], ['De Rode Raven', 'RAVEN'],
  ['Kinderen van de Nacht', 'NACHT'], ['Zonen van de Storm', 'ZVDS'], ['Heren van de Heuvel', 'HEUVEL'], ['De Oude Eed', 'EED'], ['De Stenen Wacht', 'WACHT'],
  ['Wolven van het Noorden', 'WVHN'], ['Leeuwen van Vlaanderen', 'LVV'], ['Adelaars van Gelre', 'AVG'], ['Beren van de Veluwe', 'BVDV'], ['Vossen van de Kempen', 'VVDK'],
] as const;

/** Generated tribe names when the list runs out: [first word, its tag part]. */
export const TRIBE_FIRST = [
  ['Iron', 'I'], ['Black', 'B'], ['Red', 'R'], ['Silent', 'S'], ['Golden', 'G'], ['Dark', 'D'], ['Wild', 'W'], ['Northern', 'N'], ['Eternal', 'E'], ['Royal', 'R'],
  ['Blood', 'B'], ['Storm', 'S'], ['Shadow', 'S'], ['Thunder', 'T'], ['Frost', 'F'], ['Fire', 'F'], ['Stone', 'S'], ['Steel', 'S'], ['Crimson', 'C'], ['Holy', 'H'],
  ['Zwarte', 'Z'], ['Rode', 'R'], ['Gouden', 'G'], ['IJzeren', 'IJ'], ['Wilde', 'W'], ['Stille', 'S'], ['Grijze', 'G'], ['Oude', 'O'], ['Vrije', 'V'], ['Laatste', 'L'],
] as const;
export const TRIBE_SECOND = [
  ['Wolves', 'W'], ['Ravens', 'R'], ['Knights', 'K'], ['Legion', 'L'], ['Brotherhood', 'B'], ['Guard', 'G'], ['Order', 'O'], ['Horde', 'H'], ['Clan', 'C'], ['Riders', 'R'],
  ['Lions', 'L'], ['Dragons', 'D'], ['Bears', 'B'], ['Hawks', 'H'], ['Vipers', 'V'], ['Hammers', 'H'], ['Shields', 'S'], ['Blades', 'B'], ['Crowns', 'C'], ['Banners', 'B'],
  ['Wolven', 'W'], ['Raven', 'R'], ['Ridders', 'R'], ['Broeders', 'B'], ['Wachters', 'W'], ['Leeuwen', 'L'], ['Draken', 'D'], ['Beren', 'B'], ['Valken', 'V'], ['Zwaarden', 'Z'],
] as const;

/** How a tribe dresses its tag: [DD], ~DD~, -DD-. */
export const TAG_STYLES = ['{}', '{}', '{}', '~{}~', '-{}-', '.{}.', '{}!', 'x{}x', '_{}_', '{}*'] as const;
