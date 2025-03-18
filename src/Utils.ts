import { getCollection } from "astro:content";
import type { CollectionEntry } from 'astro:content';
import type { PostInfo } from './content.config.ts';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface BlogPostEntry{
  id: string;
  postInfo: PostInfo;
  body?: string;
  filePath? : string;
}

export async function getAllPosts(): Promise<BlogPostEntry[]> {
  const posts = await getCollection('blog');
  let entrys = posts.map((item: CollectionEntry<'blog'>): BlogPostEntry => ({
    id: item.id,
    postInfo: {
      ...item.data,
      tags: item.data.tags ? Array.from(new Set(item.data.tags)) : undefined
    },
    body: item.body,
    filePath: item.filePath,
  }));

  return entrys.sort((a, b) => {
    let l = a.postInfo.pubDate?.getDate() ?? 0;
    let r = b.postInfo.pubDate?.getDate() ?? 0;
    return l - r;
  });
}

export interface TagInfo {
  tag: string;
  posts: BlogPostEntry[];
}

export async function getAllTags(): Promise<TagInfo[]> {
  const posts = await getAllPosts();
  let tags = new Map<string, TagInfo>();
  posts.forEach((item: BlogPostEntry) => {
    item.postInfo.tags?.forEach((tag: string) => {
      if (tags.has(tag)) {
        tags.get(tag)!.posts.push(item);
      } else {
        tags.set(tag, {
          tag: tag,
          posts: [item],
        });
      }
    });
  });
  return Array.from(tags.values()).sort((a, b) => b.posts.length - a.posts.length);
}