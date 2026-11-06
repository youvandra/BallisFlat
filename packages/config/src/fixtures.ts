// The curated fixture list: UEFA Nations League 2026-27 matchdays 5 and 6, plus one played warm-up match.
//
// Kick-offs (UTC) checked on 2026-11-06 against englandfootball.com, rte.ie (FAI fixture release),
// faw.cymru and the UEFA-time listing on Wikipedia's League A/B pages: every MD5/MD6 match below
// starts 20:45 CET = 19:45 UTC.
//
// Player ids (stored on-chain as uint32) are global and stable per person: player-ids.json maps
// "TEAM:Name" to an id and is append-only (never renumber; the API's database continues the sequence).
// Squad numbers are the shirt numbers from the latest official matchday sheet where one exists;
// otherwise they are the order of the federation's published list (1..n). Numbers are unique per team.
import type { Fixture, Player, Position, Team } from "./fixtures.types";
import playerIds from "./player-ids.json";

type Entry = readonly [number: number, name: string, position: Position];
type Squad = { team: Team; source: { url: string; readOn: string }; entries: readonly Entry[] };

const READ_ON = "2026-11-06";

/** Numbers a published list in its own order when the federation gives no shirt numbers. */
function inOrder(list: ReadonlyArray<readonly [string, Position]>): Entry[] {
  return list.map(([name, position], i) => [i + 1, name, position] as const);
}

const ids = playerIds as Record<string, number>;

/** The global id of a player; a squad entry without one is a bug in player-ids.json. */
export function playerIdOf(teamCode: string, name: string): number {
  const id = ids[`${teamCode}:${name}`];
  if (id === undefined) throw new Error(`no player id for ${teamCode}:${name} in player-ids.json`);
  return id;
}

function players(squad: Squad, side: Player["side"]): Player[] {
  return squad.entries.map(([number, name, position]) => ({
    id: playerIdOf(squad.team.code, name),
    name,
    number,
    position,
    side,
  }));
}

// ---------- teams ----------

const ENG: Team = { code: "ENG", name: "England", colour: "#FFFFFF" };
const CRO: Team = { code: "CRO", name: "Croatia", colour: "#E30613" };
const NIR: Team = { code: "NIR", name: "Northern Ireland", colour: "#00843D" };
const UKR: Team = { code: "UKR", name: "Ukraine", colour: "#FFD500" };
const ESP: Team = { code: "ESP", name: "Spain", colour: "#C60B1E" };
const HUN: Team = { code: "HUN", name: "Hungary", colour: "#CE2939" };
const IRL: Team = { code: "IRL", name: "Republic of Ireland", colour: "#169B62" };
const KVX: Team = { code: "KVX", name: "Kosovo", colour: "#244AA5" };
const WAL: Team = { code: "WAL", name: "Wales", colour: "#C8102E" };
const POR: Team = { code: "POR", name: "Portugal", colour: "#A6192E" };

// ---------- squads ----------

// England: Sept/Oct 2026 window squad (November squad due 6 Nov 10:00 GMT, not yet read).
// Numbers from the Croatia 0-7 England match sheet (3 Oct 2026); Rico Lewis and Nico O'Reilly were
// not on that sheet and take 24 and 25.
const england: Squad = {
  team: ENG,
  source: { url: "https://www.englandfootball.com/england/mens-senior-team/squad", readOn: READ_ON },
  entries: [
    [1, "Jordan Pickford", "GK"],
    [13, "James Trafford", "GK"],
    [23, "Jason Steele", "GK"],
    [3, "Lewis Hall", "DF"],
    [5, "Ezri Konsa", "DF"],
    [6, "Marc Guéhi", "DF"],
    [12, "Trevoh Chalobah", "DF"],
    [15, "Jarrad Branthwaite", "DF"],
    [16, "Myles Lewis-Skelly", "DF"],
    [22, "Jarell Quansah", "DF"],
    [24, "Rico Lewis", "DF"],
    [25, "Nico O'Reilly", "DF"],
    [2, "Trent Alexander-Arnold", "MF"],
    [4, "Alex Scott", "MF"],
    [8, "Elliot Anderson", "MF"],
    [10, "Jude Bellingham", "MF"],
    [17, "Morgan Rogers", "MF"],
    [18, "James Garner", "MF"],
    [20, "Morgan Gibbs-White", "MF"],
    [7, "Bukayo Saka", "FW"],
    [9, "Harry Kane", "FW"],
    [11, "Anthony Gordon", "FW"],
    [14, "Rio Ngumoha", "FW"],
    [19, "Dominic Calvert-Lewin", "FW"],
    [21, "Eberechi Eze", "FW"],
  ],
};

// Croatia: HNS squad of 7 Sept 2026 for the Sept/Oct window (November squad due 6 Nov).
// Numbers from the 3 Oct 2026 match sheet; the four players not on it take 24-27.
const croatia: Squad = {
  team: CRO,
  source: {
    url: "https://hns.team/en/news/31687/slaven-bilic-announces-squad-for-new-nations-league-campaign/",
    readOn: READ_ON,
  },
  entries: [
    [1, "Dominik Livaković", "GK"],
    [12, "Ivor Pandur", "GK"],
    [23, "Dominik Kotarski", "GK"],
    [2, "Josip Stanišić", "DF"],
    [3, "Ivan Smolčić", "DF"],
    [4, "Joško Gvardiol", "DF"],
    [5, "Luka Vušković", "DF"],
    [6, "Josip Šutalo", "DF"],
    [24, "Josip Juranović", "DF"],
    [25, "Martin Erlić", "DF"],
    [8, "Mateo Kovačić", "MF"],
    [10, "Luka Modrić", "MF"],
    [13, "Nikola Vlašić", "MF"],
    [15, "Mario Pašalić", "MF"],
    [16, "Martin Baturina", "MF"],
    [17, "Petar Sučić", "MF"],
    [21, "Luka Sučić", "MF"],
    [22, "Josip Mišić", "MF"],
    [7, "Franjo Ivanović", "FW"],
    [9, "Andrej Kramarić", "FW"],
    [11, "Petar Musa", "FW"],
    [14, "Ivan Perišić", "FW"],
    [19, "Marco Pašalić", "FW"],
    [20, "Igor Matanović", "FW"],
    [26, "Ante Budimir", "FW"],
    [27, "Dion Drena Beljo", "FW"],
  ],
};

// Northern Ireland: official November 2026 squad (Irish FA, 3 Nov 2026).
const northernIreland: Squad = {
  team: NIR,
  source: {
    url: "https://www.irishfa.com/news/2026/november/northern-ireland-squad-for-final-b2-games-revealed",
    readOn: READ_ON,
  },
  entries: inOrder([
    ["Conor Hazard", "GK"],
    ["Pierce Charles", "GK"],
    ["Dermot Mee", "GK"],
    ["Ciaron Brown", "DF"],
    ["Brodie Spencer", "DF"],
    ["Paddy McNair", "DF"],
    ["Trai Hume", "DF"],
    ["Ruairi McConville", "DF"],
    ["Terry Devlin", "DF"],
    ["Tom Atcheson", "DF"],
    ["Michael Forbes", "DF"],
    ["Ethan Galbraith", "MF"],
    ["Justin Devenny", "MF"],
    ["Shea Charles", "MF"],
    ["Isaac Price", "MF"],
    ["Paul Smyth", "MF"],
    ["Jordan Thompson", "MF"],
    ["Patrick Kelly", "MF"],
    ["Kieran Morrison", "MF"],
    ["Josh Magennis", "FW"],
    ["Callum Marshall", "FW"],
    ["Jamie Donley", "FW"],
    ["Braiden Graham", "FW"],
    ["Ceadach O'Neill", "FW"],
    ["Eoin Kenny", "FW"],
  ]),
};

// Ukraine: UAF squad of 16 Sept 2026 for the Sept/Oct window, with the 17 Sept changes applied
// (Dovbyk and Andriievskyi out, Pikhalonok and Krasnopir in). November squad not yet published.
const ukraine: Squad = {
  team: UKR,
  source: {
    url: "https://uaf.ua/en/news/ukraine-national-team-squad-for-the-nations-league-match",
    readOn: READ_ON,
  },
  entries: inOrder([
    ["Anatoliy Trubin", "GK"],
    ["Dmytro Riznyk", "GK"],
    ["Heorhiy Yermakov", "GK"],
    ["Illia Zabarnyi", "DF"],
    ["Mykola Matviienko", "DF"],
    ["Valerii Bondar", "DF"],
    ["Eduard Sarapii", "DF"],
    ["Bohdan Mykhailichenko", "DF"],
    ["Vitalii Mykolenko", "DF"],
    ["Taras Mykhavko", "DF"],
    ["Illia Krupskyi", "DF"],
    ["Oleksandr Drambaiev", "DF"],
    ["Oleh Ocheretko", "MF"],
    ["Yehor Nazaryna", "MF"],
    ["Volodymyr Brazhko", "MF"],
    ["Mykola Shaparenko", "MF"],
    ["Andriy Yarmolenko", "MF"],
    ["Oleksandr Nazarenko", "MF"],
    ["Ivan Varfolomieiev", "MF"],
    ["Heorhii Sudakov", "MF"],
    ["Maksym Khlan", "MF"],
    ["Oleksandr Zubkov", "MF"],
    ["Viktor Tsyhankov", "MF"],
    ["Oleksandr Pikhalonok", "MF"],
    ["Danylo Sikan", "FW"],
    ["Artem Stepanov", "FW"],
    ["Matviy Ponomarenko", "FW"],
    ["Vladyslav Vanat", "FW"],
    ["Roman Yaremchuk", "FW"],
    ["Ihor Krasnopir", "FW"],
  ]),
};

// Spain: squad named 18 Sept 2026 for the Sept/Oct window (November squad due 6 Nov).
// RFEF pages refuse automated reads; list as reported, matching across three outlets.
const spain: Squad = {
  team: ESP,
  source: { url: "https://blueprint.ng/?p=845996", readOn: READ_ON },
  entries: inOrder([
    ["Unai Simón", "GK"],
    ["David Raya", "GK"],
    ["Josep Martínez", "GK"],
    ["Aymeric Laporte", "DF"],
    ["Pau Cubarsí", "DF"],
    ["Marc Pubill", "DF"],
    ["Dean Huijsen", "DF"],
    ["Pedro Porro", "DF"],
    ["Eric García", "DF"],
    ["Marc Cucurella", "DF"],
    ["Alejandro Grimaldo", "DF"],
    ["Rodri", "MF"],
    ["Fabián Ruiz", "MF"],
    ["Pedri", "MF"],
    ["Mikel Merino", "MF"],
    ["Martín Zubimendi", "MF"],
    ["Álex Baena", "MF"],
    ["Fermín López", "MF"],
    ["Mikel Oyarzabal", "FW"],
    ["Ferran Torres", "FW"],
    ["Dani Olmo", "FW"],
    ["Roberto Fernández", "FW"],
    ["Lamine Yamal", "FW"],
    ["Víctor Muñoz", "FW"],
    ["Nico Williams", "FW"],
    ["Yeremy Pino", "FW"],
  ]),
};

// Hungary: official November 2026 squad (named 3 Nov 2026).
const hungary: Squad = {
  team: HUN,
  source: {
    url: "https://index.hu/sport/futball/2026/11/03/magyar-labdarugo-valogatott-kerethirdetes-marco-rossi-sallai-roland-varga-barnabas-georgia-eszak-irorszag",
    readOn: READ_ON,
  },
  entries: inOrder([
    ["Bence Gundel-Takács", "GK"],
    ["Ármin Pécsi", "GK"],
    ["Balázs Tóth", "GK"],
    ["Bendegúz Bolla", "DF"],
    ["Márk Csinger", "DF"],
    ["Milos Kerkez", "DF"],
    ["Ákos Markgráf", "DF"],
    ["Zsolt Nagy", "DF"],
    ["Willi Orbán", "DF"],
    ["Attila Osváth", "DF"],
    ["Attila Szalai", "DF"],
    ["Bence Várkonyi", "DF"],
    ["Péter Baráth", "MF"],
    ["Áron Csongvai", "MF"],
    ["Milán Pető", "MF"],
    ["András Schäfer", "MF"],
    ["Callum Styles", "MF"],
    ["Dominik Szoboszlai", "MF"],
    ["Rajmund Tóth", "MF"],
    ["József Urblík", "MF"],
    ["Milán Vitális", "MF"],
    ["Gábor Jurek", "FW"],
    ["Dániel Lukács", "FW"],
    ["Damir Redzic", "FW"],
    ["Roland Sallai", "FW"],
    ["Ákos Szendrei", "FW"],
    ["Barnabás Varga", "FW"],
  ]),
};

// Republic of Ireland: squad named 17 Sept 2026 for the Sept/Oct window (November squad not yet out).
const ireland: Squad = {
  team: IRL,
  source: { url: "https://www.irishexaminer.com/sport/soccer/arid-41912224.html", readOn: READ_ON },
  entries: inOrder([
    ["Caoimhín Kelleher", "GK"],
    ["Max O'Leary", "GK"],
    ["Gavin Bazunu", "GK"],
    ["Dara O'Shea", "DF"],
    ["Jake O'Brien", "DF"],
    ["Liam Scales", "DF"],
    ["John Egan", "DF"],
    ["James Abankwah", "DF"],
    ["Jimmy Dunne", "DF"],
    ["Liam Kitching", "DF"],
    ["Ryan Manning", "DF"],
    ["Joel Bagan", "DF"],
    ["Jayson Molumby", "MF"],
    ["Jason Knight", "MF"],
    ["Finn Azaz", "MF"],
    ["Bosun Lawal", "MF"],
    ["Jamie McGrath", "MF"],
    ["Harvey Vale", "MF"],
    ["Conor Coventry", "MF"],
    ["Troy Parrott", "FW"],
    ["Adam Idah", "FW"],
    ["Chiedozie Ogbene", "FW"],
    ["Tom Cannon", "FW"],
    ["Owen Elding", "FW"],
    ["Jack Moylan", "FW"],
    ["Rocco Vata", "FW"],
  ]),
};

// Kosovo: squad named 18 Sept 2026 for the Sept/Oct window (November squad not yet out).
// The source lists midfielders and forwards together; the split below is by usual role.
const kosovo: Squad = {
  team: KVX,
  source: {
    url: "https://www.balkanweb.com/del-lista-e-kosoves-mes-te-grumbulluarve-edhe-talenti-i-bayern/",
    readOn: READ_ON,
  },
  entries: inOrder([
    ["Arijanet Muric", "GK"],
    ["Amir Saipi", "GK"],
    ["Visar Bekaj", "GK"],
    ["Mërgim Vojvoda", "DF"],
    ["Lumbardh Dellova", "DF"],
    ["Ilir Krasniqi", "DF"],
    ["Albian Hajdari", "DF"],
    ["Ron Raçi", "DF"],
    ["Leard Sadriu", "DF"],
    ["Dion Gallapeni", "DF"],
    ["Milot Avdyli", "MF"],
    ["Baton Zabërgja", "MF"],
    ["Veldin Hoxha", "MF"],
    ["Erblin Osmani", "MF"],
    ["Lindon Emërllahu", "MF"],
    ["Leon Avdullahu", "MF"],
    ["Dion Kacuri", "MF"],
    ["Donat Rrudhani", "MF"],
    ["Muharrem Jashari", "MF"],
    ["Valmir Matoshi", "MF"],
    ["Ermal Krasniqi", "FW"],
    ["Milot Rashica", "FW"],
    ["Edon Zhegrova", "FW"],
    ["Fisnik Asllani", "FW"],
    ["Albion Rrahmani", "FW"],
    ["Vedat Muriqi", "FW"],
  ]),
};

// Wales: official November 2026 squad (FAW, 4 Nov 2026). The FAW sheet has no position headings;
// positions follow its goalkeeper-defender-midfield-attack order.
const wales: Squad = {
  team: WAL,
  source: { url: "https://faw.cymru/news/cymru-squad-announced-for-norway-and-portugal/", readOn: READ_ON },
  entries: inOrder([
    ["Karl Darlow", "GK"],
    ["Danny Ward", "GK"],
    ["Joe Duncan", "GK"],
    ["Jay DaSilva", "DF"],
    ["Jayden Lienou", "DF"],
    ["Ben Davies", "DF"],
    ["Chris Mepham", "DF"],
    ["Joe Rodon", "DF"],
    ["Ben Cabango", "DF"],
    ["Neco Williams", "DF"],
    ["Connor Roberts", "DF"],
    ["Ethan Ampadu", "MF"],
    ["Josh Sheehan", "MF"],
    ["Kai Andrews", "MF"],
    ["Rubin Colwill", "MF"],
    ["Joel Colwill", "MF"],
    ["Harry Wilson", "MF"],
    ["Liam Cullen", "FW"],
    ["Cian Ashford", "FW"],
    ["Brennan Johnson", "FW"],
    ["Sorba Thomas", "FW"],
    ["Lewis Koumas", "FW"],
    ["Kieffer Moore", "FW"],
    ["Mark Harris", "FW"],
    ["Dan James", "FW"],
    ["David Brooks", "MF"],
  ]),
};

// Portugal: Jorge Jesus's squad of 18 Sept 2026 for the Sept/Oct window (November squad due 6 Nov).
const portugal: Squad = {
  team: POR,
  source: {
    url: "https://tribunadosertao.com.br/esportes/2026/09/18/981267-jorge-jesus-faz-primeira-convocacao-pela-selecao-de-portugal-com-cristiano-ronaldo",
    readOn: READ_ON,
  },
  entries: inOrder([
    ["Diogo Costa", "GK"],
    ["Rui Silva", "GK"],
    ["Samuel Soares", "GK"],
    ["Gonçalo Inácio", "DF"],
    ["Renato Veiga", "DF"],
    ["Rúben Dias", "DF"],
    ["Tomás Araújo", "DF"],
    ["João Cancelo", "DF"],
    ["Diogo Dalot", "DF"],
    ["Nuno Tavares", "DF"],
    ["Nuno Mendes", "DF"],
    ["Bruno Fernandes", "MF"],
    ["João Palhinha", "MF"],
    ["Rúben Neves", "MF"],
    ["João Neves", "MF"],
    ["Vitinha", "MF"],
    ["Bernardo Silva", "MF"],
    ["Cristiano Ronaldo", "FW"],
    ["Fábio Silva", "FW"],
    ["Francisco Trincão", "FW"],
    ["Francisco Conceição", "FW"],
    ["Gonçalo Ramos", "FW"],
    ["João Félix", "FW"],
    ["Pedro Neto", "FW"],
    ["Rafael Leão", "FW"],
  ]),
};

// Warm-up only: the 23-man match sheets from Croatia 0-7 England, 3 Oct 2026 (Rijeka).
const warmUpSource = {
  url: "https://www.englandfootball.com/england/mens-senior-team/fixtures-results/2026-27/Nations-League/croatia-england-uefa-nations-league-saturday-3-october-2026-match-centre",
  readOn: READ_ON,
};

const croatiaOct3: Squad = {
  team: CRO,
  source: warmUpSource,
  entries: [
    [1, "Dominik Livaković", "GK"],
    [12, "Ivor Pandur", "GK"],
    [23, "Dominik Kotarski", "GK"],
    [2, "Josip Stanišić", "DF"],
    [3, "Ivan Smolčić", "DF"],
    [4, "Joško Gvardiol", "DF"],
    [5, "Luka Vušković", "DF"],
    [6, "Josip Šutalo", "DF"],
    [8, "Mateo Kovačić", "MF"],
    [10, "Luka Modrić", "MF"],
    [13, "Nikola Vlašić", "MF"],
    [15, "Mario Pašalić", "MF"],
    [16, "Martin Baturina", "MF"],
    [17, "Petar Sučić", "MF"],
    [18, "Kristijan Jakić", "MF"],
    [21, "Luka Sučić", "MF"],
    [22, "Josip Mišić", "MF"],
    [7, "Franjo Ivanović", "FW"],
    [9, "Andrej Kramarić", "FW"],
    [11, "Petar Musa", "FW"],
    [14, "Ivan Perišić", "FW"],
    [19, "Marco Pašalić", "FW"],
    [20, "Igor Matanović", "FW"],
  ],
};

const englandOct3: Squad = {
  team: ENG,
  source: warmUpSource,
  entries: england.entries.filter(([number]) => number <= 23),
};

// ---------- fixtures ----------

const NATIONS_LEAGUE = "UEFA Nations League 2026-27";

function fixture(
  slug: string,
  matchday: number,
  kickoff: string,
  home: Squad,
  away: Squad,
  extra: Partial<Fixture> = {},
): Fixture {
  return {
    slug,
    matchday,
    competition: NATIONS_LEAGUE,
    home: home.team,
    away: away.team,
    kickoff,
    players: [...players(home, "home"), ...players(away, "away")],
    // One URL per fixture: the home squad's. The away squad's source is in `squadSources`.
    squadSource: home.source,
    ...extra,
  };
}

export const fixtures: Fixture[] = [
  fixture("croatia-v-england", 0, "2026-10-03T16:00:00Z", croatiaOct3, englandOct3, { warmUp: true }),
  fixture("england-v-croatia", 5, "2026-11-12T19:45:00Z", england, croatia),
  fixture("northern-ireland-v-ukraine", 5, "2026-11-14T19:45:00Z", northernIreland, ukraine),
  fixture("spain-v-england", 6, "2026-11-15T19:45:00Z", spain, england),
  fixture("hungary-v-northern-ireland", 6, "2026-11-17T19:45:00Z", hungary, northernIreland),
  fixture("ireland-v-kosovo", 6, "2026-11-17T19:45:00Z", ireland, kosovo),
  fixture("wales-v-portugal", 6, "2026-11-17T19:45:00Z", wales, portugal),
];

/** Where each team's squad list came from, keyed by FIFA code (both sides of every fixture). */
export const squadSources: Record<string, { url: string; readOn: string }> = Object.fromEntries(
  [england, croatia, northernIreland, ukraine, spain, hungary, ireland, kosovo, wales, portugal].map((s) => [
    s.team.code,
    s.source,
  ]),
);
