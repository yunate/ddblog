// scripts/generate-search-index.ts
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import fg from 'fast-glob';

const contentDir = 'src/blogs';
const outputPath = 'public/search-index.json';

function getUrlFromSlugOrPath(slug: string, filePath: string): string {
  if (slug) return `/posts/${slug}/`;

  // fallback: derive from file path
  const relative = filePath.replace(/^src\/blogs\//, '').replace(/\.md$/, '');
  return `/posts/${relative}/`;
}

async function generateSearchIndex() {
  console.log(`===================================generateSearchIndex===================================`);
  const files = await fg(`${contentDir}/**/*.md`);

  const index = [];

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf-8');
    const { data, content } = matter(raw);
    const title = data.title ?? '';
    const tags = data.tags ?? [];
    const slug = data.slug ?? '';
    const url = getUrlFromSlugOrPath(slug, file);

    index.push({
      title,
      url,
      body: content,
      tags
    });
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, JSON.stringify(index, null, 2), 'utf-8');
  console.log(`✅ search-index.json generated with ${index.length} entries.`);
}

generateSearchIndex();
