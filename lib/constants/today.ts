import { CheckCircle2, Clock, Sparkles, Zap, Target } from 'lucide-react';

export const BOT_CANONICAL_NAME: Record<string, string> = {
  Drake: 'Drake',
  Adrian: 'Drake',
  Drizzy: 'Drizzy',
  Ruby: 'Drizzy',
  'Champagne Papi': 'Champagne Papi',
  Emerald: 'Champagne Papi',
  'Aubrey Graham': 'Aubrey Graham',
  Adobe: 'Aubrey Graham',
  'Adobe Pettaway': 'Aubrey Graham',
  '6 God': '6 God',
  Anchor: '6 God',
};

export function normalizeBotName(name: string): string {
  return BOT_CANONICAL_NAME[name] ?? name;
}

export const BOT_TELEGRAM_KEY: Record<string, string> = {
  Drake: 'bot1',
  Drizzy: 'bot2',
  'Champagne Papi': 'bot3',
  'Aubrey Graham': 'botAdobe',
  '6 God': 'botAnchor',
};

export const BOT_OWNER_LOGIN: Record<string, string> = Object.fromEntries(
  Object.keys(BOT_CANONICAL_NAME).map((name) => [name, normalizeBotName(name).toLowerCase()])
) as Record<string, string>;

export const ALL_BOTS = ['Drake', 'Drizzy', 'Champagne Papi', 'Aubrey Graham', '6 God'];

export const BOT_COLORS: Record<string, { bg: string; text: string }> = {
  Drake: { bg: 'var(--color-peach)', text: 'var(--color-peach-text)' },
  Drizzy: { bg: 'var(--color-pink)', text: 'var(--color-pink-text)' },
  'Champagne Papi': { bg: 'var(--color-mint)', text: 'var(--color-mint-text)' },
  'Aubrey Graham': { bg: 'var(--color-lemon)', text: 'var(--color-lemon-text)' },
  '6 God': { bg: 'var(--color-lavender)', text: 'var(--color-lavender-text)' },
};

export const APPROVAL_BG: Record<string, string> = {
  email: 'var(--color-lavender)',
  finance: 'var(--color-mint)',
  tasks: 'var(--color-sky)',
  other: 'var(--color-peach)',
};

export const APPROVAL_TEXT: Record<string, string> = {
  email: 'var(--color-lavender-text)',
  finance: 'var(--color-mint-text)',
  tasks: 'var(--color-sky-text)',
  other: 'var(--color-peach-text)',
};

export const BOT_BORDER: Record<string, string> = {
  Drake: '#E53E3E',
  Drizzy: 'var(--color-purple)',
  'Champagne Papi': 'var(--color-cyan)',
  'Aubrey Graham': '#FFB800',
  '6 God': '#8A6DFF',
  default: 'var(--color-purple)',
};

export const TIMELINE_ICON_MAP = {
  check: CheckCircle2,
  clock: Clock,
  alert: Sparkles,
  spark: Zap,
  focus: Target,
};

export type DailyAffirmationBar = {
  text: string;
  song: string;
};

export const DAILY_AFFIRMATION_BARS: readonly DailyAffirmationBar[] = [
  { text: "I don't wanna smile if it ain't from you.", song: 'Jaded (Scorpion)' },
  { text: "I wasn't hidin' my kid from the world, I was hidin' the world from my kid.", song: 'Emotionless (Scorpion)' },
  { text: "Breakin' speed records on roads that these niggas paved.", song: 'Emotionless (Scorpion)' },
  { text: 'Iconic duos rip and split at the seams.', song: 'Emotionless (Scorpion)' },
  { text: "Good-hearted people are takin' it to extremes.", song: 'Emotionless (Scorpion)' },
  { text: 'House on both coasts, but I live on the charts.', song: 'Survival (Scorpion)' },
  { text: 'I have tea with the stars and I swim with the sharks.', song: 'Survival (Scorpion)' },
  { text: "I see in the dark, wasn't this cold at the start.", song: 'Survival (Scorpion)' },
  { text: "Think my soul has been marked, there's a hole in my heart.", song: 'Survival (Scorpion)' },
  { text: "End up gettin' loose and gettin' pictures from my ex.", song: "Can't Take a Joke (Scorpion)" },
  { text: "Trust me, at the top it isn't lonely.", song: 'Nonstop (Scorpion)' },
  { text: 'Everybody acting like they know me.', song: 'Nonstop (Scorpion)' },
  { text: "Started from the bottom now we're here.", song: 'Started From The Bottom (Nothing Was the Same)' },
  { text: "Just hold on, we're going home.", song: "Hold On, We're Going Home (Nothing Was the Same)" },
  { text: "I'm more than just an option, hey hey hey.", song: 'Find Your Love (Thank Me Later)' },
  { text: 'You know life is what we make it.', song: 'Cameras / Good Ones Go Interlude (Take Care)' },
  { text: 'Nobody really likes us except for us.', song: 'No New Friends (DJ Khaled ft. Drake, Rick Ross, Lil Wayne)' },
  { text: 'You used to call me on my cellphone.', song: 'Hotline Bling (Views)' },
  { text: "My team good, we don't really need a mascot.", song: 'Trophies (Single)' },
  { text: "I live for the nights that I can't remember with the people I won't forget.", song: 'Show Me a Good Time (Thank Me Later)' },
  { text: "Who you sleepin' on? You should print the lyrics out and have a f*ckin' read-along.", song: "F**kin' Problems (A$AP Rocky ft. Drake, 2 Chainz & Kendrick Lamar)" },
  { text: 'Last name Ever, first name Greatest.', song: 'Forever (Drake, Kanye West, Lil Wayne, Eminem)' },
  { text: "I want things to go my way / But as of late, a lot of shit been goin' sideways.", song: 'Successful (So Far Gone)' },
  { text: "Sweatpants, hair tied, chillin' with no make-up on / That's when you're the prettiest.", song: 'Best I Ever Had (So Far Gone)' },
  { text: 'This lost boy got fly without Peter Pan.', song: 'Successful (So Far Gone)' },
  { text: "Ain't heard my album? Who you sleepin' on?", song: "F**kin' Problems (A$AP Rocky ft. Drake, 2 Chainz & Kendrick Lamar)" },
  { text: "When you get to where you're going, remember where you came from.", song: 'Over My Dead Body (Take Care)' },
  { text: "You know it's real when you are who you think you are.", song: 'Pound Cake / Paris Morton Music 2 (Nothing Was the Same)' },
  { text: 'Man, where your ass was at when we took the city over?', song: 'Where Ya At (Future ft. Drake, DS2)' },
  { text: 'I just took a piss and I seen codeine coming out.', song: 'Thought It Was a Drought (Future, DS2)' },
  { text: 'We got purple Activis, I thought it was a drought.', song: 'Thought It Was a Drought (Future, DS2)' },
  { text: "Had to struggle to get where I'm at and sell dope.", song: 'Thought It Was a Drought (Future, DS2)' },
  { text: 'Strapped a bird on her back, now she came back with change.', song: 'Thought It Was a Drought (Future, DS2)' },
  { text: "There's a lot on my mind, there's a lot on my plate, but I never complain.", song: 'Thought It Was a Drought (Future, DS2)' },
  { text: 'I was working the weight like I came out the gym—I never did train.', song: 'Thought It Was a Drought (Future, DS2)' },
  { text: "They don't like it when you're telling the truth, I'd rather be realer than you.", song: "No Tellin' (If You're Reading This It's Too Late)" },
  { text: "Take care of you, that's what I'll do.", song: 'Take Care (ft. Rihanna, Take Care)' },
  { text: "The world's yours if you want it.", song: 'The Ride (Take Care)' },
  { text: 'Why you gotta fight with me at Cheesecake? You know I love to go there.', song: "Child's Play (Views)" },
  { text: "I'm here for a good time, not a long time.", song: 'Blessings (Big Sean ft. Drake, Dark Sky Paradise)' },
  { text: "You could have been anywhere in the world, but you're here with me.", song: "6 God (If You're Reading This It's Too Late)" },
  { text: "People like to talk, but I'm still the topic.", song: 'Headlines (Take Care)' },
  { text: "Table for one, that's the mood tonight.", song: 'Jaded (Scorpion)' },
  { text: "Sometimes it's the journey that teaches you a lot about your destination.", song: 'Thank Me Now (Thank Me Later)' },
  { text: "I'm way up, I feel blessed.", song: 'Blessings (Big Sean ft. Drake, Dark Sky Paradise)' },
  { text: 'Everybody dies but not everybody lives.', song: 'Moment 4 Life (Nicki Minaj ft. Drake, Pink Friday)' },
  { text: 'Trust me, the pressure builds character.', song: 'Diamonds Dancing (Drake & Future, What a Time to Be Alive)' },
  { text: 'I learned working with the negatives can make for better pictures.', song: 'Under Ground Kings (Take Care)' },
  { text: 'If I ever made you angry, just know that it gets better with time.', song: 'Time Heals (Bryson Tiller ft. Drake, unofficial/remix)' },
];

export function pickRandomAffirmationBar(): DailyAffirmationBar {
  const index = Math.floor(Math.random() * DAILY_AFFIRMATION_BARS.length);
  return (
    DAILY_AFFIRMATION_BARS[index] ?? {
      text: 'You move with intention and grace.',
      song: 'Daily affirmation',
    }
  );
}
