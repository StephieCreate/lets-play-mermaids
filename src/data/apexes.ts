export type ApexAvailability = 'available' | 'dev';

export interface Apex {
  slug: string;
  name: string;
  species: string;
  epithet: string;
  lore: string;
  available: boolean;
}

export const apexes: Apex[] = [
  {
    slug: 'kial',
    name: 'Kial',
    species: 'Bull Shark',
    epithet: 'The Unyielding Warden',
    lore: 'Kial is strict, commanding, and expects order. He thrives on setting the rules and ensuring they are followed to the letter. Romancing Kial is a game of push and pull—if you like to test boundaries, he is more than happy to put you back in your place. Expect a dynamic where playful defiance is met with unshakeable authority, and where earning his softer side means accepting his absolute control.',
    available: true,
  },
  {
    slug: 'severin',
    name: 'Severin',
    species: 'Great White',
    epithet: 'The Intense Isolator',
    lore: 'A solitary apex predator, Severin hides a deep, aching need for connection behind an intimidating presence. Romancing him is an all-consuming experience. He wants to be your entire world, preferring to strip away all outside distractions so your focus is solely on him. Beneath his commanding exterior is a deeply touch-starved soul who just wants you wrapped up safely in his domain, blind to everything but him.',
    available: true,
  },
  {
    slug: 'ezra',
    name: 'Ezra',
    species: 'Orca',
    epithet: 'The Devoted Sovereign',
    lore: 'Majestic and powerful, Ezra wants nothing more than to put you on a pedestal. He is a commanding presence, but one who uses his authority entirely to spoil and worship his partner. Romancing Ezra means surrendering control to someone whose primary goal is your absolute satisfaction and comfort. He craves physical connection and will happily take charge to ensure you are treated like royalty.',
    available: true,
  },
  {
    slug: 'malibu',
    name: 'Malibu',
    species: 'Tiger Shark',
    epithet: 'The Adrenaline Junkie',
    lore: 'Malibu is all sharp teeth, rebellious energy, and dangerous posturing. He thrives on a challenge and doesn\'t know how to turn off his fighting spirit. Romancing Malibu isn\'t about soft romance; it\'s about matching his fierce intensity. He loves a partner who will push back, trade playful blows, and match his rough-and-tumble nature. If you can stand your ground and enjoy the thrill of the spar, you\'ll win the heart of this wild delinquent.',
    available: true,
  },
  {
    slug: 'ricsa',
    name: 'Ricsa',
    species: 'Oceanic Whitetip',
    epithet: 'The Praising Pursuer',
    lore: 'Ricsa thrives on the thrill of the hunt, constantly seeking out your affection and attention. He loves the excitement of chase play, always eager to catch you and reward your surrender with endless adoration and praise. Romancing Ricsa requires profound trust; he desires your complete submission, but it must be given willingly out of devotion, never out of fear. Give in to him, and he will make sure you feel entirely cherished.',
    available: true,
  },
  {
    slug: 'akuma',
    name: 'Akuma',
    species: 'Humboldt Squid',
    epithet: 'The Enigmatic Embracer',
    lore: 'Cold-blooded and calculating, Akuma is drawn to warmth and absolute closeness. His ideal romance involves keeping you perfectly secure, bound closely to him so you can\'t slip away. He is highly possessive and deeply affectionate in his own unconventional way. Romancing Akuma means letting him completely overwhelm your senses and secure you in his grasp, holding you so tightly that he becomes the only thing you can focus on.',
    available: false,
  },
  {
    slug: 'vanna',
    name: 'Vanna',
    species: 'Silky Shark',
    epithet: 'The Cunning Challenger',
    lore: 'Sleek, sharp, and highly selective, Vanna is looking for a partner who can truly impress her. She will test your confidence at every turn, searching for someone competent enough to take the lead. Romancing Vanna is about proving you can handle her. She wants a strong partner she can depend on and willingly yield to, but only if you respect her power and prove you are worthy of holding the reins.',
    available: false,
  },
  {
    slug: 'idris',
    name: 'Idris',
    species: 'Great Hammerhead',
    epithet: 'The Tactical Mastermind',
    lore: 'Clean, calculated, and insufferably arrogant, Idris is the unscarred 15-foot titan of the open blue who views the dark ocean not as a brawl or a cave, but as a three-dimensional game of underwater chess. Utilizing his massive cephalofoil radar to track every heartbeat, current, and thermocline, he outmaneuvers threats so flawlessly that no enemy has ever landed a blow on his pristine hide. Romancing Idris is a high-stakes, enemies-to-lovers battle of wits. He has zero interest in crude brute force or helpless prey; he demands an intellectual equal capable of solving the oceans deadliest puzzles. If you want to earn the respect of this strict, calculating mastermind, you will not win by thrashing or pleading—you’ll have to outsmart the ocean, see through his tactical posturing, and prove you can play The Deep Dark Game alongside him.',
    available: true,
  },
];
