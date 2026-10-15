#!/usr/bin/env bash
# Nexus OS —— 服务器一次性初始化脚本
#
# 用法（在服务器上以 root 执行一次）：
#   curl -fsSL https://raw.githubusercontent.com/og-liu/nexus-os/main/deploy/scripts/bootstrap-server.sh | sudo bash
#
# 幂等：重复执行不会破坏已有配置。
#
# 做完之后服务器上会有：
#   /opt/nexus-os/{releases,incoming,bin,shared}   发布目录结构
#   /opt/nexus-os/bin/release.sh                   发布脚本（切换版本 + 重启服务）
#   /etc/nginx/conf.d/nexus-os.conf                Nginx 反向代理
#   /etc/systemd/system/nexus-os.service           服务单元（守护 + 开机自启）
#   /etc/sudoers.d/nexus-os-deploy                 deploy 用户只被授权跑 release.sh
#
# 服务器上不需要装 pnpm：构建在 CI 完成，产物是自包含的 standalone。

set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/og-liu/nexus-os/main}"

APP_DIR=/opt/nexus-os
DEPLOY_USER=deploy      # 部署用（CI 通过它 SSH 进来）
RUN_USER=nexus          # 服务运行用（不给登录权限）

log() { echo -e "\n==> $*"; }

log "1/7 安装 Node.js 22"
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v 2>/dev/null)" != v22* ]]; then
  curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
  dnf install -y nodejs
fi
node -v

log "2/7 安装 Nginx"
dnf install -y nginx

log "3/7 创建用户"
id -u "$RUN_USER"    >/dev/null 2>&1 || useradd -r -s /sbin/nologin -d "$APP_DIR" "$RUN_USER"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || useradd -m -s /bin/bash "$DEPLOY_USER"
log "已创建/已存在：$RUN_USER（运行）、$DEPLOY_USER（部署）"

log "4/7 创建目录结构"
mkdir -p "$APP_DIR"/{releases,incoming,bin,shared}
chown -R "$RUN_USER:$RUN_USER" "$APP_DIR"
# incoming 需要让部署用户能写入
chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR/incoming"

log "5/7 安装发布脚本与 sudo 授权"
curl -fsSL "$REPO_RAW/deploy/scripts/release.sh" -o "$APP_DIR/bin/release.sh"
chmod 755 "$APP_DIR/bin/release.sh"
chown root:root "$APP_DIR/bin/release.sh"

# 只授权这一条命令，不给 deploy 用户完整的 root 权限
cat > /etc/sudoers.d/nexus-os-deploy <<EOF
# 允许 $DEPLOY_USER 免密执行 Nexus OS 发布脚本（仅此一条）
$DEPLOY_USER ALL=(root) NOPASSWD: $APP_DIR/bin/release.sh
EOF
chmod 440 /etc/sudoers.d/nexus-os-deploy
visudo -c >/dev/null && log "sudoers 语法检查通过"

log "6/7 安装 systemd 服务单元"
curl -fsSL "$REPO_RAW/deploy/systemd/nexus-os.service" -o /etc/systemd/system/nexus-os.service
systemctl daemon-reload
systemctl enable nexus-os >/dev/null 2>&1 || true
log "已 enable（下次开机自启）。首次发布后服务才会真正起来。"

log "7/7 安装 Nginx 配置并启动"
curl -fsSL "$REPO_RAW/deploy/nginx/nexus-os.conf" -o /etc/nginx/conf.d/nexus-os.conf
# 阿里云默认站点会占用 80 的 default_server，先关掉避免冲突
[ -f /etc/nginx/conf.d/default.conf ] && mv /etc/nginx/conf.d/default.conf /etc/nginx/conf.d/default.conf.disabled || true
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

cat <<'DONE'

──────────────────────────────────────────────
✅ 服务器初始化完成

下一步（手动做一次）：
  1) 把 CI 用的部署公钥写入 deploy 用户的授权列表：
       echo "<部署公钥内容>" >> ~deploy/.ssh/authorized_keys
       chmod 700 ~deploy/.ssh && chmod 600 ~deploy/.ssh/authorized_keys
       chown -R deploy:deploy ~deploy/.ssh
  2) 环境变量（如需要）写到：
       /opt/nexus-os/shared/.env.production
  3) 去 GitHub 仓库配置 Secrets：SSH_HOST / SSH_USER / SSH_KEY
  4) push 到 main，观察 Actions 自动发布

查看服务状态：systemctl status nexus-os
查看服务日志：journalctl -u nexus-os -n 50
回滚上一版：  sudo /opt/nexus-os/bin/release.sh --rollback
──────────────────────────────────────────────
DONE
