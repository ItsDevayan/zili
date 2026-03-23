/**
 * theme.js — Ubuntu beautification via zili
 * Run: zili theme
 *
 * Installs and configures:
 *   - Dracula GTK theme
 *   - Papirus Dark icon theme
 *   - neofetch with a custom config
 *   - A nice terminal prompt
 *   - GNOME settings (dock, fonts, dark mode)
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');

const HOME = os.homedir();

const c = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  cyan:    '\x1b[36m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  magenta: '\x1b[35m',
  gray:    '\x1b[90m',
  white:   '\x1b[97m',
};

const ok  = (msg) => console.log(`  ${c.green}✓${c.reset}  ${msg}`);
const run = (msg) => console.log(`  ${c.cyan}→${c.reset}  ${msg}`);
const warn = (msg) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`);
const ask = (q) => new Promise(res => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question(q, ans => { rl.close(); res(ans.trim().toLowerCase()); });
});

function sh(cmd, opts = {}) {
  try {
    return spawnSync('bash', ['-c', cmd], { stdio: 'inherit', ...opts });
  } catch (e) {
    return { status: 1 };
  }
}

function shSilent(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
  } catch (_) {
    return '';
  }
}

function hasCmd(cmd) {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true; } catch (_) { return false; }
}

// ─── Steps ────────────────────────────────────────────────────────────────────

async function installNeofetch() {
  run('Installing neofetch...');
  if (hasCmd('neofetch')) { ok('neofetch already installed'); }
  else { sh('sudo apt-get install -y neofetch'); ok('neofetch installed'); }

  // Write a clean neofetch config
  const neofetchDir = path.join(HOME, '.config', 'neofetch');
  fs.mkdirSync(neofetchDir, { recursive: true });

  const config = `# Zili neofetch config
print_info() {
    info title
    info underline
    info "OS" distro
    info "Kernel" kernel
    info "Uptime" uptime
    info "Shell" shell
    info "Resolution" resolution
    info "DE" de
    info "Terminal" term
    info "CPU" cpu
    info "Memory" memory
    info cols
}

image_backend="ascii"
ascii_distro="auto"
ascii_colors=(4 4 4 4 4 4)
bold="on"
colors=(4 6 1 8 8 6)
`;

  fs.writeFileSync(path.join(neofetchDir, 'config.conf'), config);
  ok('neofetch configured');

  // Add to .bashrc if not already there
  const bashrc = path.join(HOME, '.bashrc');
  const bashrcContent = fs.readFileSync(bashrc, 'utf-8');
  if (!bashrcContent.includes('neofetch')) {
    fs.appendFileSync(bashrc, '\n# Show system info on new terminal\nneofetch\n');
    ok('neofetch added to .bashrc (runs on new terminals)');
  } else {
    ok('neofetch already in .bashrc');
  }
}

async function installDraculaTheme() {
  run('Installing Dracula GTK theme...');

  const themesDir = path.join(HOME, '.themes');
  fs.mkdirSync(themesDir, { recursive: true });

  const draculaDir = path.join(themesDir, 'Dracula');

  if (fs.existsSync(draculaDir)) {
    ok('Dracula theme already installed');
  } else {
    sh('git clone https://github.com/dracula/gtk /tmp/zili-dracula-theme --depth=1 -q');
    if (fs.existsSync('/tmp/zili-dracula-theme')) {
      sh(`cp -r /tmp/zili-dracula-theme "${draculaDir}"`);
      sh('rm -rf /tmp/zili-dracula-theme');
      ok('Dracula GTK theme installed');
    } else {
      warn('Could not download Dracula theme (needs git + internet)');
    }
  }

  // Apply via gsettings
  sh('gsettings set org.gnome.desktop.interface gtk-theme "Dracula"');
  sh('gsettings set org.gnome.desktop.interface color-scheme "prefer-dark"');
  ok('Dracula theme applied');
}

async function installPapirusIcons() {
  run('Installing Papirus icon theme...');

  const result = shSilent('dpkg -l papirus-icon-theme 2>/dev/null | grep "^ii"');
  if (result) {
    ok('Papirus already installed');
  } else {
    sh('sudo add-apt-repository -y ppa:papirus/papirus 2>/dev/null');
    sh('sudo apt-get update -qq');
    sh('sudo apt-get install -y papirus-icon-theme');
    ok('Papirus icons installed');
  }

  sh('gsettings set org.gnome.desktop.interface icon-theme "Papirus-Dark"');
  ok('Papirus Dark icons applied');
}

async function installFonts() {
  run('Installing JetBrains Mono font...');

  const fontDir = path.join(HOME, '.local', 'share', 'fonts');
  fs.mkdirSync(fontDir, { recursive: true });

  const fontFiles = fs.readdirSync(fontDir).filter(f => f.includes('JetBrains'));
  if (fontFiles.length > 0) {
    ok('JetBrains Mono already installed');
    return;
  }

  sh([
    'curl -fsSL -o /tmp/JetBrainsMono.zip',
    '"https://github.com/JetBrains/JetBrainsMono/releases/download/v2.304/JetBrainsMono-2.304.zip"',
    `&& unzip -q /tmp/JetBrainsMono.zip "fonts/ttf/*.ttf" -d /tmp/jbmono`,
    `&& cp /tmp/jbmono/fonts/ttf/*.ttf "${fontDir}/"`,
    '&& fc-cache -f',
    '&& rm -rf /tmp/JetBrainsMono.zip /tmp/jbmono',
  ].join(' '));

  sh('gsettings set org.gnome.desktop.interface monospace-font-name "JetBrains Mono 11"');
  ok('JetBrains Mono installed and set as monospace font');
}

async function setupGnome() {
  run('Configuring GNOME settings...');

  // Enable dark mode
  sh('gsettings set org.gnome.desktop.interface color-scheme "prefer-dark"');
  ok('Dark mode enabled');

  // Disable animations (snappier feel)
  sh('gsettings set org.gnome.desktop.interface enable-animations false');
  ok('Animations disabled (snappier)');

  // Show weekday in clock
  sh('gsettings set org.gnome.desktop.interface clock-show-weekday true');
  ok('Clock shows weekday');

  // Show battery percentage
  sh('gsettings set org.gnome.desktop.interface show-battery-percentage true 2>/dev/null || true');

  // Dock settings (if Ubuntu dock exists)
  sh('gsettings set org.gnome.shell.extensions.dash-to-dock dock-position BOTTOM 2>/dev/null || true');
  sh('gsettings set org.gnome.shell.extensions.dash-to-dock dash-max-icon-size 36 2>/dev/null || true');
  sh('gsettings set org.gnome.shell.extensions.dash-to-dock show-mounts false 2>/dev/null || true');
  ok('Dock configured');
}

async function setupTerminalPrompt() {
  run('Setting up a nicer terminal prompt...');

  const bashrc = path.join(HOME, '.bashrc');
  let content = fs.readFileSync(bashrc, 'utf-8');

  if (content.includes('ZILI_PROMPT')) {
    ok('Custom prompt already set');
    return;
  }

  const prompt = `
# ZILI_PROMPT — nicer terminal prompt
parse_git_branch() {
  git branch 2>/dev/null | sed -e '/^[^*]/d' -e 's/* \\(.*\\)/ (\\1)/'
}
export PS1="\\n\\[\\033[1;35m\\]✦ \\[\\033[1;36m\\]\\u\\[\\033[0;37m\\]@\\[\\033[1;34m\\]\\h \\[\\033[1;32m\\]\\w\\[\\033[0;33m\\]\\$(parse_git_branch)\\[\\033[0m\\]\\n\\[\\033[1;35m\\]→ \\[\\033[0m\\]"
`;

  fs.appendFileSync(bashrc, prompt);
  ok('Terminal prompt updated (restart terminal to see it)');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function runTheme() {
  console.log(`\n  ${c.magenta}${c.bold}Zili Theme Setup${c.reset}\n`);
  console.log('  Makes your Ubuntu look actually good.\n');
  console.log(`  ${c.gray}What will be installed:${c.reset}`);
  console.log(`    • Dracula GTK theme (dark, purple accents)`);
  console.log(`    • Papirus Dark icon theme`);
  console.log(`    • JetBrains Mono font`);
  console.log(`    • neofetch (system info on terminal open)`);
  console.log(`    • Nicer terminal prompt with git branch`);
  console.log(`    • GNOME tweaks (dark mode, dock, clock)\n`);

  const confirm = await ask(`  ${c.cyan}Proceed? (y/N): ${c.reset}`);
  if (confirm !== 'y' && confirm !== 'yes') {
    console.log(`\n  Cancelled.\n`);
    return;
  }

  console.log();

  try { await installNeofetch(); } catch (e) { warn(`neofetch: ${e.message}`); }
  try { await installDraculaTheme(); } catch (e) { warn(`Dracula theme: ${e.message}`); }
  try { await installPapirusIcons(); } catch (e) { warn(`Papirus icons: ${e.message}`); }
  try { await installFonts(); } catch (e) { warn(`Fonts: ${e.message}`); }
  try { await setupGnome(); } catch (e) { warn(`GNOME settings: ${e.message}`); }
  try { await setupTerminalPrompt(); } catch (e) { warn(`Prompt: ${e.message}`); }

  console.log(`\n  ${c.green}${c.bold}Done!${c.reset} Log out and back in for all changes to apply.\n`);
}

module.exports = { runTheme };
