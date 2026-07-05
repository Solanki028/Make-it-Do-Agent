import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 1. Create a default user
  const user = await prisma.user.upsert({
    where: { email: 'default@makeitdo.ai' },
    update: {},
    create: {
      email: 'default@makeitdo.ai',
      passwordHash: 'argon2_hashed_placeholder_for_production',
    },
  });
  console.log('Created default user:', user.email);

  // 2. Create a default conversation
  const conversation = await prisma.conversation.create({
    data: {
      title: 'Analyze workspace structure',
      userId: user.id,
    },
  });
  console.log('Created initial conversation session:', conversation.id);

  // 3. Create filesystem MCP configuration
  const workspacePath = 'C:/Users/Priyanshu/Downloads/Project folders/Make It Do-Agent';
  const connectionString = JSON.stringify([
    'npx',
    '-y',
    '@modelcontextprotocol/server-filesystem',
    workspacePath,
  ]);

  const mcpConfig = await prisma.mCPConfig.upsert({
    where: { name: 'local-filesystem' },
    update: {
      connectionString,
      isEnabled: true,
    },
    create: {
      name: 'local-filesystem',
      transportType: 'STDIO',
      connectionString,
      envVariables: JSON.stringify({}),
      isEnabled: true,
    },
  });
  console.log('Registered local-filesystem MCP server:', mcpConfig.name);

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
