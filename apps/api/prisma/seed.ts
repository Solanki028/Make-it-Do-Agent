import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log(' Seeding database...');

  // ── 1. Default user ────────────────────────────────────────────────────
  const user = await prisma.user.upsert({
    where: { email: 'default@makeitdo.ai' },
    update: {},
    create: {
      email: 'default@makeitdo.ai',
      passwordHash: 'argon2_hashed_placeholder_for_production',
    },
  });
  console.log(' Default user:', user.email);

  // ── 2. Default conversation ────────────────────────────────────────────
  const existingConv = await prisma.conversation.findFirst({ where: { userId: user.id } });
  if (!existingConv) {
    const conversation = await prisma.conversation.create({
      data: { title: 'Analyze workspace structure', userId: user.id },
    });
    console.log(' Default conversation:', conversation.id);
  }

  // ── 3. MCP: Local Filesystem ───────────────────────────────────────────
  const workspacePath = 'C:/Users/Priyanshu/Downloads/Project folders/Make It Do-Agent';
  await prisma.mCPConfig.upsert({
    where: { name: 'local-filesystem' },
    update: {
      connectionString: JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-filesystem', workspacePath]),
      isEnabled: true,
    },
    create: {
      name: 'local-filesystem',
      transportType: 'STDIO',
      connectionString: JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-filesystem', workspacePath]),
      envVariables: {},
      isEnabled: true,
    },
  });
  console.log(' MCP registered: local-filesystem');

  // ── 4. MCP: Web Fetch (free, no API key required) ─────────────────────
  // Gives the agent the ability to fetch any public URL and read its content.
  // Completely free — no API key needed.
  await prisma.mCPConfig.upsert({
    where: { name: 'web-fetch' },
    update: {
      connectionString: JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-fetch']),
      isEnabled: true,
    },
    create: {
      name: 'web-fetch',
      transportType: 'STDIO',
      connectionString: JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-fetch']),
      envVariables: {},
      isEnabled: true,
    },
  });
  console.log(' MCP registered: web-fetch (enabled — fetch any public URL, no API key needed)');

  // ── 5. MCP: GitHub ─────────────────────────────────────────────────────
  // Requires GITHUB_PERSONAL_ACCESS_TOKEN env variable.
  // Set isEnabled: false by default — user enables it from the Settings UI after adding their token.
  await prisma.mCPConfig.upsert({
    where: { name: 'github' },
    update: {},
    create: {
      name: 'github',
      transportType: 'STDIO',
      connectionString: JSON.stringify(['npx', '-y', '@modelcontextprotocol/server-github']),
      envVariables: {
        GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN ?? '',
      },
      isEnabled: false, // Enable from Settings UI once token is configured
    },
  });
  console.log(' MCP registered: github (disabled — add GITHUB_PERSONAL_ACCESS_TOKEN in Settings to enable)');

  console.log('\n Seeding completed!');
  console.log('    web-fetch is enabled — agent can now read any public URL');
  console.log('     To enable GitHub MCP: ensure GITHUB_TOKEN is in .env and toggle in /settings');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
