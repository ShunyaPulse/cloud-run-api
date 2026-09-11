#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════
#  setup-vm.sh — Automated Provisioning for Oracle Cloud VM.Standard.E2.1.Micro
# ══════════════════════════════════════════════════════════════════════
# Run this on your Oracle Cloud VM (Ubuntu):
#   bash setup-vm.sh
# ══════════════════════════════════════════════════════════════════════

set -euo pipefail

echo "=========================================================="
echo " Starting OCI E2.1.Micro Provisioning"
echo "=========================================================="

# ─── 1. Configure 4GB Swap Memory (CRITICAL for 1GB RAM) ─────────────
if [ ! -f /swapfile ]; then
    echo "→ Creating 4GB swap space to prevent Out-Of-Memory crashes..."
    sudo fallocate -l 4G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    # Optimize swappiness
    sudo sysctl vm.swappiness=20
    echo 'vm.swappiness=20' | sudo tee -a /etc/sysctl.conf
    echo "✔ Swap configured successfully."
else
    echo "✔ Swap already configured."
fi

# ─── 2. Update packages & Install Docker ──────────────────────────────
echo "→ Installing Docker & Docker Compose..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg lsb-release ufw

if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sudo sh
    sudo usermod -aG docker "$USER"
    echo "✔ Docker installed."
fi

# ─── 3. Oracle Cloud OS Firewall Setup (Ubuntu) ──────────────────────
# Note: Oracle Cloud images run iptables by default that block external ports.
echo "→ Opening ports for Uptime Kuma (3001) and Redis (6379)..."
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 3001 -j ACCEPT || true
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 6379 -j ACCEPT || true

if command -v netfilter-persistent &> /dev/null; then
    sudo netfilter-persistent save
fi

# ─── 4. Start the Supporting Stack ───────────────────────────────────
echo "→ Starting Redis and Uptime Kuma containers..."
sudo docker compose up -d

echo ""
echo "=========================================================="
echo "  ✔ OCI Infrastructure Ready!"
echo "  Uptime Kuma Dashboard: http://<YOUR_OCI_PUBLIC_IP>:3001"
echo "  Redis Connection:      redis://:<password>@<YOUR_OCI_PUBLIC_IP>:6379"
echo "=========================================================="
