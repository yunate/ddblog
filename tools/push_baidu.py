import requests
import re
import json
from pathlib import Path

# 从 global.js 中提取 siteUrl
def extract_site_url(js_path):
    with open(js_path, 'r', encoding='utf-8') as f:
        content = f.read()
    match = re.search(r"export\s+const\s+siteUrl\s*=\s*['\"](.*?)['\"]\s*;", content)
    if match:
        return match.group(1).rstrip('/')
    else:
        raise ValueError("siteUrl not found in global.js")

# 读取已成功推送的URL列表
def read_pushed_urls(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return set(line.strip() for line in f if line.strip())
    except FileNotFoundError:
        return set()

# 写入成功推送的URL列表
def write_pushed_urls(file_path, urls):
    with open(file_path, 'w', encoding='utf-8') as f:
        for url in urls:
            f.write(f"{url}\n")

# 转换所有 md 文件为 URL
def generate_urls(blogs_root, site_url, pushed_urls=None):
    blogs_root = Path(blogs_root).resolve()
    md_files = blogs_root.rglob('*.md')
    urls = []
    filtered_count = 0

    if pushed_urls is None:
        pushed_urls = set()

    for md_file in md_files:
        rel_path = md_file.relative_to(blogs_root)
        url_path = str(rel_path.with_suffix('')).replace('\\', '/')
        url = f"{site_url}/posts/{url_path}"
        
        # 过滤已推送的URL
        if url in pushed_urls:
            filtered_count += 1
            continue

        urls.append(url)
        print(f"Added URL: {url}")

    if filtered_count > 0:
        print(f"Filtered {filtered_count} already pushed URLs")

    return urls


# 主函数
def main():
    script_dir = Path(__file__).resolve().parent

    # 提取站点URL
    site_url = extract_site_url(script_dir / '../globals.js')

    # 已推送URL的记录文件
    pushed_urls_file = script_dir / 'pushed_baidu_urls.txt'

    # 读取已推送的URL
    pushed_urls = read_pushed_urls(pushed_urls_file)

    # 生成需要推送的URL列表（过滤掉已推送的）
    urls = generate_urls(script_dir / '../src/blogs', site_url, pushed_urls)

    if not urls:
        print("No new URLs to push.")
        return

    # 发起 POST 请求
    print(f"Pushing {len(urls)} new URLs to Baidu...")
    headers = {
        'Content-Type': 'text/plain',
    }
    payload = '\n'.join(urls)
    token = 'SHfZRcONwvgaxeFr'
    api = f'http://data.zz.baidu.com/urls?site={site_url}&token={token}'
    response = requests.post(api, headers=headers, data=payload)

    # 打印响应结果
    print(f"Status code: {response.status_code}")
    print(f"Response: {response.text}")

    # 处理推送结果，保存成功推送的URL
    try:
        result = json.loads(response.text)
        success_count = result.get('success', 0)

        if success_count > 0:
            # 将成功推送的URL添加到已推送列表中
            success_urls = urls[:success_count]
            pushed_urls.update(success_urls)

            # 写入到文件
            write_pushed_urls(pushed_urls_file, pushed_urls)
            print(f"Successfully pushed {success_count} URLs and saved to {pushed_urls_file}")
        else:
            print("No URLs were successfully pushed.")

    except Exception as e:
        print(f"Error processing response: {e}")

if __name__ == "__main__":
    main()
