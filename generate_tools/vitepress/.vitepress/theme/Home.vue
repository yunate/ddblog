<script setup>
import { useData } from "vitepress";
import { ref } from "vue";
const { frontmatter } = useData();

const posts = ref([
  { title: "文章 1", date: "2024-03-01", link: "/post1" },
  { title: "文章 2", date: "2024-02-15", link: "/post2" },
  { title: "文章 3", date: "2023-12-10", link: "/post3" },
]);


const groupedPosts = posts.value.reduce((acc, post) => {
  const year = post.date.split("-")[0];
  if (!acc[year]) acc[year] = [];
  acc[year].push(post);
  return acc;
}, {});
</script>

<template>
  <div class="home">
    <h1>{{ frontmatter.title || "📅 最新文章" }}</h1>

    <div v-for="(posts, year) in groupedPosts" :key="year">
      <div class="year-divider">{{ year }}</div>
      <ul>
        <li v-for="post in posts" :key="post.link">
          <a :href="post.link">{{ post.title }}</a>
          <span class="date">{{ post.date }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<style>
.home {
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}
.year-divider {
  font-size: 24px;
  font-weight: bold;
  margin: 20px 0;
  padding: 10px;
  background: #f4f4f4;
  border-left: 5px solid #007acc;
}
ul {
  list-style: none;
  padding: 0;
}
li {
  display: flex;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid #ddd;
}
.date {
  color: #666;
  font-size: 14px;
}
</style>
