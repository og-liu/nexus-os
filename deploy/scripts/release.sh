#!/usr/bin/env bash
# Nexus OS —— 服务器端发布脚本
# 落地位置：/opt/nexus-os/bin/release.sh
#
# 职责：把 incoming/ 里的发布包解开成一个新版本目录，原子切换 current 软链接，
#       重启服务，并清理过旧版本。可重复执行 —— 出问题时手动重跑即可复现。
#
# 用法：sudo /opt/nexus-os/bin/release.sh
#       sudo /opt/nexus-os/bin/release.sh --rollback   # 回滚到上一个版本

set -euo pipefail

APP_DIR=/opt/nexus-os
SERVICE=nexus-os
RUN_USER=nexus
KEEP=5                     # 保留最近 5 个版本，便于回滚
PKG="$APP_DIR/incoming/release.tar.gz"

log() { echo "[release] $*"; }

# ── 回滚模式 ────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  PREV=$(ls -1dt "$APP_DIR"/releases/*/ | sed -n 2p || true)
  [ -n "$PREV" ] || { log "没有上一个版本可回滚"; exit 1; }
  log "回滚到 $PREV"
  ln -sfn "${PREV%/}" "$APP_DIR/current.tmp"
  mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"
  systemctl restart "$SERVICE"
  log "回滚完成"
  exit 0
fi

# ── 正常发布 ────────────────────────────────────────────────
[ -f "$PKG" ] || { log "找不到发布包：$PKG"; exit 1; }

TS=$(date +%Y%m%d-%H%M%S)
NEW="$APP_DIR/releases/$TS"

log "解开发布包 → $NEW"
mkdir -p "$NEW"
tar -xzf "$PKG" -C "$NEW"
rm -f "$PKG"

# standalone 产物不带 public（如果项目里有的话），补齐以防万一
[ -d "$APP_DIR/shared/public" ] && cp -r "$APP_DIR/shared/public" "$NEW/" || true

chown -R "$RUN_USER:$RUN_USER" "$NEW"

# 原子切换：先建临时软链接再 mv，避免出现指向半截目录的瞬间
log "切换 current 指针"
ln -sfn "$NEW" "$APP_DIR/current.tmp"
mv -Tf "$APP_DIR/current.tmp" "$APP_DIR/current"

log "重启服务"
systemctl restart "$SERVICE"

# 重启后确认真的活着 —— 发布脚本自己必须验证结果，不能只看命令退出码
sleep 2
if ! systemctl is-active --quiet "$SERVICE"; then
  log "❌ 服务启动失败，查看日志：journalctl -u $SERVICE -n 50"
  exit 1
fi

# 清理旧版本，只留最近 KEEP 个
ls -1dt "$APP_DIR"/releases/*/ | tail -n +$((KEEP + 1)) | xargs -r rm -rf

log "✅ 发布完成：$TS（保留最近 $KEEP 个版本）"
