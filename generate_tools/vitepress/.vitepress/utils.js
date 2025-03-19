
import fs from "fs"
import path from "path"

function _getSidebarItems(dir, base) {
  const items = [];
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relativePath = path.join(base, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      const children = _getSidebarItems(fullPath, relativePath);
      items.push({
        text: file,
        collapsed: true,
        items: children,
      });
    } else if (file.endsWith(".md")) {
      if (file === "index.md") {
        continue;
      }
      const name = file.replace(/\.md$/, "");
      items.push({
        text: name,
        link: `/${relativePath.replace(/\\/g, "/")}`,
      });
    }
  }
  return items;
}

export function _getSortedPosts(postsDir) {
  const files = fs.readdirSync(postsDir);
  const posts = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      posts.push(_getSortedPosts(fullPath));
    } else if (file.endsWith(".md")) {
      if (file === "index.md") {
        continue;
      }
      const filePath = path.join(postsDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const { data } = matter(content);

      const date = data.date
        ? new Date(data.date)
        : fs.statSync(filePath).birthtime;

      posts.push({
        title: data.title || file.replace(".md", ""),
        date,
        link: `/${file.replace(".md", "")}`,
      });
    }
  }

  return posts;
}

export function getBaseDocDirPath() {
  return path.resolve(__dirname, "../../../md");
}

export function getSidebarItems() {
  return _getSidebarItems(path.resolve(__dirname, "../../../md"), "");
}

export function getSortedPosts() {
  let posts = _getSortedPosts(getBaseDocDirPath());
  posts.sort((a, b) => b.date - a.date);
  return posts;
}
