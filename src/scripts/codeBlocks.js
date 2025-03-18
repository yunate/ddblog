// 代码块标题栏和复制功能脚本
document.addEventListener('DOMContentLoaded', function() {
  // 为所有代码块添加标题栏
  function enhanceCodeBlocks() {
    const preElements = document.querySelectorAll('pre');

    preElements.forEach(pre => {
      // 如果已经处理过，跳过
      if (pre.closest('.code-block-container')) {
        return;
      }

      const language = pre.getAttribute('data-language') || 'text';
      const code = pre.querySelector('code');

      if (!code) {
         return;
      }

      // 创建容器
      const container = document.createElement('div');
      container.className = 'code-block-container';

      // 检查当前主题
      if (document.documentElement.classList.contains('dark') ||
          pre.classList.contains('dark')) {
        container.classList.add('dark');
      }

      // 创建标题栏
      const header = document.createElement('div');
      header.className = 'code-header';

      // 创建语言标签
      const languageLabel = document.createElement('span');
      languageLabel.className = 'code-language';
      languageLabel.textContent = language;

      // 创建复制按钮
      const copyButton = document.createElement('button');
      copyButton.className = 'copy-button';
      copyButton.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        <span class="copy-text">复制</span>
      `;

      // 复制功能
      copyButton.addEventListener('click', async function() {
        try {
          // 获取代码文本，排除行号
          const codeText = Array.from(code.children)
            .map(line => line.textContent)
            .join('\n');

          await navigator.clipboard.writeText(codeText);

          // 更新按钮状态
          copyButton.classList.add('copied');
          const textSpan = copyButton.querySelector('.copy-text');
          const originalText = textSpan.textContent;
          textSpan.textContent = '已复制';
          
          // 更新图标为勾选
          copyButton.querySelector('svg').innerHTML = `
            <path d="M20 6L9 17l-5-5"></path>
          `;

          // 5秒后恢复
          setTimeout(() => {
            copyButton.classList.remove('copied');
            textSpan.textContent = originalText;
            copyButton.querySelector('svg').innerHTML = `
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            `;
          }, 5000);
        } catch (err) {
          console.error('复制失败:', err);
          // 降级到选择文本
          const range = document.createRange();
          range.selectNodeContents(code);
          const selection = window.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        }
      });

      // 组装标题栏
      header.appendChild(languageLabel);
      header.appendChild(copyButton);

      // 将pre元素包装到容器中
      pre.parentNode.insertBefore(container, pre);
      container.appendChild(header);
      container.appendChild(pre);
    });
  }
  
  // 主题切换时更新代码块样式
  function updateCodeBlockTheme() {
    const containers = document.querySelectorAll('.code-block-container');
    const isDark = document.documentElement.classList.contains('dark');
    
    containers.forEach(container => {
      if (isDark) {
        container.classList.add('dark');
      } else {
        container.classList.remove('dark');
      }
    });
  }

  // 初始化
  enhanceCodeBlocks();

  // 监听主题变化
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        updateCodeBlockTheme();
      }
    });
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['class']
  });

  // 为动态添加的代码块提供支持
  window.enhanceCodeBlocks = enhanceCodeBlocks;
});
