import { publishV2Event } from '@/lib/v2/event-bus';

export type BotStatus = {
  task: string;
  updatedAt: Date;
};

const botStatusStore = new Map<string, BotStatus>();

const BOT_NAMES = ['Ruby', 'Scorpion', 'Drizzy', 'Drake', 'Adrian'];

// Initialize with some mock data
BOT_NAMES.forEach(name => {
  botStatusStore.set(name, {
    task: 'Idle',
    updatedAt: new Date(),
  });
});

export function updateBotStatus(botName: string, task: string) {
  const status: BotStatus = {
    task,
    updatedAt: new Date(),
  };
  botStatusStore.set(botName, status);
  publishV2Event('dashboard', 'bot.status.updated', { botName, status });
}

export function getBotStatuses(): Record<string, BotStatus> {
  return Object.fromEntries(botStatusStore.entries());
}

// Simulate bot activity for demonstration
let demoInterval: NodeJS.Timeout | null = null;

function startDemo() {
  if (demoInterval) return;

  const demoTasks = [
    'Analyzing Q2 performance data',
    'Drafting response to "Project X Update"',
    'Building new deployment script for API service',
    'Reviewing new user feedback',
    'Optimizing database queries',
    'Sleeping...',
  ];

  demoInterval = setInterval(() => {
    const randomBot = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const randomTask = demoTasks[Math.floor(Math.random() * demoTasks.length)];
    updateBotStatus(randomBot, randomTask);
  }, 5000);
}

startDemo();
