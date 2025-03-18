import * as globals from '../globals.js';
import { glob } from "astro/loaders";
import { z, defineCollection } from "astro:content";

const blogSchema = z.object({
  title: z.string(),
  pubDate: z.date(),
  description: z.string(),
  author: z.string(),
  image: z.object({
    url: z.string(),
    alt: z.string()
  }),
  tags: z.array(z.string())
});

const blog = defineCollection({
  loader: glob({ pattern: '**/[^_]*.md', base: globals.blogsPath }),
});

export const collections = { blog };
export interface PostInfo {
  title?: string;
  pubDate?: Date;
  description?: string;
  author?: string;
  image?: {
    url: string;
    alt: string;
  };
  tags?: string[];
}
