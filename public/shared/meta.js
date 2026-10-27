// Game metadata shared by server and client.

export const MAX_PLAYERS = 10;
export const ROUND_OPTIONS = [3, 5, 7, 10];

export const COLORS = [
  '#ff4d6d', // watermelon
  '#ff9f1c', // orange
  '#ffd23f', // sunny
  '#8ac926', // lime
  '#06d6a0', // mint
  '#00bbf9', // sky
  '#3a86ff', // blue
  '#9b5de5', // grape
  '#ff70d8', // bubblegum
  '#f4f1de', // marshmallow
  '#b5754c', // cocoa
  '#7d8bae', // storm
];

export const HATS = ['none', 'party', 'tophat', 'horns', 'bow', 'antenna', 'sprout', 'cap'];
export const HAT_LABELS = ['No hat', 'Party hat', 'Top hat', 'Horns', 'Bow', 'Antenna', 'Sprout', 'Cap'];

export const EMOTES = ['😂', '😡', '😎', '👋'];

export const GAMES = {
  lobby: {
    name: 'Lobby', icon: '🎈', kind: 'none',
    tag: 'Bonk around while you wait',
    how: 'Move with WASD / arrows, DASH with space.',
  },
  sumo: {
    name: 'Sumo Ring', icon: '🥋', kind: 'elim',
    tag: 'Last blob on the platform wins',
    how: 'DASH into rivals to launch them off the edge. The ring keeps shrinking!',
  },
  potato: {
    name: 'Hot Potato', icon: '💣', kind: 'elim',
    tag: "Don't hold the bomb when it blows",
    how: 'Touch someone to pass the bomb. Bomb holders run faster. Boom = out.',
  },
  coins: {
    name: 'Coin Frenzy', icon: '🪙', kind: 'score',
    tag: 'Grab the most coins',
    how: 'Bonk rich players to make them spill. Big gold coins are worth 5. Coin rain at the end!',
  },
  turf: {
    name: 'Paint Panic', icon: '🎨', kind: 'score',
    tag: 'Paint the most floor',
    how: 'Roll around to paint. Grab 💥 paint bombs for huge splats. Bonks splash your color too.',
  },
  dodge: {
    name: 'Dodgeball Mayhem', icon: '🏐', kind: 'elim',
    tag: 'Last one with hearts wins',
    how: 'Roll over a ball to grab it, DASH to throw it the way you are moving. 3 hits and you are out.',
  },
  crown: {
    name: 'Crown Thief', icon: '👑', kind: 'score',
    tag: 'Wear the crown the longest',
    how: 'Grab the crown and run! DASH into the king to steal it.',
  },
};

export const GAME_ORDER = ['sumo', 'potato', 'coins', 'turf', 'dodge', 'crown'];
