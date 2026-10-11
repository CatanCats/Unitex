// Well-known open-source alternatives to popular proprietary products.
// Each entry: names people search for → [name, homepage, what it is, license].
const ALTERNATIVES = [
  { names: ["Photoshop", "Adobe Photoshop", "Affinity Photo", "Paint.NET"], alts: [
    ["GIMP", "https://www.gimp.org", "Photo editing & retouching", "GPL"],
    ["Krita", "https://krita.org", "Digital painting & illustration", "GPL"],
    ["Pinta", "https://www.pinta-project.com", "Simple image editor", "MIT"] ] },
  { names: ["Illustrator", "Adobe Illustrator", "CorelDRAW", "Affinity Designer"], alts: [
    ["Inkscape", "https://inkscape.org", "Vector graphics", "GPL"] ] },
  { names: ["Lightroom", "Adobe Lightroom", "Capture One"], alts: [
    ["darktable", "https://www.darktable.org", "RAW photo workflow", "GPL"],
    ["RawTherapee", "https://www.rawtherapee.com", "RAW photo processing", "GPL"] ] },
  { names: ["Premiere", "Premiere Pro", "Adobe Premiere", "Final Cut", "Final Cut Pro", "iMovie", "Vegas Pro", "CapCut", "Camtasia"], alts: [
    ["Kdenlive", "https://kdenlive.org", "Video editor", "GPL"],
    ["Shotcut", "https://shotcut.org", "Video editor", "GPL"],
    ["OpenShot", "https://www.openshot.org", "Beginner-friendly video editor", "GPL"] ] },
  { names: ["After Effects", "Adobe After Effects", "Maya", "Autodesk Maya", "3ds Max", "Cinema 4D", "Houdini"], alts: [
    ["Blender", "https://www.blender.org", "3D, animation, VFX & motion graphics", "GPL"] ] },
  { names: ["InDesign", "Adobe InDesign", "Microsoft Publisher", "QuarkXPress"], alts: [
    ["Scribus", "https://www.scribus.net", "Desktop publishing", "GPL"] ] },
  { names: ["Figma", "Sketch", "Adobe XD"], alts: [
    ["Penpot", "https://penpot.app", "Design & prototyping", "MPL"] ] },
  { names: ["Adobe Creative Cloud", "Creative Cloud", "Adobe"], alts: [
    ["GIMP", "https://www.gimp.org", "Instead of Photoshop", "GPL"],
    ["Inkscape", "https://inkscape.org", "Instead of Illustrator", "GPL"],
    ["Kdenlive", "https://kdenlive.org", "Instead of Premiere", "GPL"],
    ["Scribus", "https://www.scribus.net", "Instead of InDesign", "GPL"],
    ["darktable", "https://www.darktable.org", "Instead of Lightroom", "GPL"] ] },
  { names: ["AutoCAD", "SolidWorks", "Fusion 360", "SketchUp", "Inventor"], alts: [
    ["FreeCAD", "https://www.freecad.org", "3D parametric CAD", "LGPL"],
    ["LibreCAD", "https://librecad.org", "2D CAD drafting", "GPL"],
    ["OpenSCAD", "https://openscad.org", "Code-based 3D CAD", "GPL"] ] },
  { names: ["Unity", "Unreal", "Unreal Engine", "GameMaker"], alts: [
    ["Godot", "https://godotengine.org", "2D & 3D game engine", "MIT"] ] },
  { names: ["Microsoft Office", "Office", "Office 365", "Microsoft 365", "Word", "Microsoft Word", "Excel", "Microsoft Excel", "PowerPoint", "Google Docs", "Google Sheets", "Google Slides", "Google Workspace", "Pages", "Numbers", "Keynote", "WPS Office"], alts: [
    ["LibreOffice", "https://www.libreoffice.org", "Full office suite", "MPL"],
    ["ONLYOFFICE", "https://www.onlyoffice.com", "Office suite with real-time collaboration", "AGPL"],
    ["CryptPad", "https://cryptpad.org", "End-to-end encrypted collaborative docs", "AGPL"] ] },
  { names: ["Adobe Acrobat", "Acrobat", "Acrobat Reader", "Adobe Reader", "PDF editor", "Foxit"], alts: [
    ["Stirling-PDF", "https://www.stirlingpdf.com", "Self-hosted PDF toolkit", "MIT"],
    ["Okular", "https://okular.kde.org", "PDF viewer & annotator", "GPL"],
    ["PDF Arranger", "https://github.com/pdfarranger/pdfarranger", "Merge, split & reorder PDFs", "GPL"] ] },
  { names: ["Outlook", "Microsoft Outlook", "Gmail", "Apple Mail", "Spark"], alts: [
    ["Thunderbird", "https://www.thunderbird.net", "Email, calendar & contacts", "MPL"] ] },
  { names: ["Chrome", "Google Chrome", "Edge", "Microsoft Edge", "Safari", "Opera", "Arc"], alts: [
    ["Firefox", "https://www.firefox.com", "Independent web browser", "MPL"],
    ["LibreWolf", "https://librewolf.net", "Privacy-hardened Firefox", "MPL"],
    ["Chromium", "https://www.chromium.org", "Open base of Chrome", "BSD"] ] },
  { names: ["Windows", "Microsoft Windows", "macOS", "Mac OS"], alts: [
    ["Linux Mint", "https://linuxmint.com", "Easy desktop Linux", "GPL"],
    ["Ubuntu", "https://ubuntu.com", "Popular desktop Linux", "GPL"],
    ["Fedora", "https://fedoraproject.org", "Modern desktop Linux", "GPL"] ] },
  { names: ["Android", "iOS", "Google Android"], alts: [
    ["LineageOS", "https://lineageos.org", "De-Googled Android", "Apache"],
    ["GrapheneOS", "https://grapheneos.org", "Security-focused Android", "MIT"] ] },
  { names: ["Google Drive", "Dropbox", "OneDrive", "iCloud", "iCloud Drive", "Box"], alts: [
    ["Nextcloud", "https://nextcloud.com", "Self-hosted cloud: files, calendar, contacts", "AGPL"],
    ["Syncthing", "https://syncthing.net", "Peer-to-peer file sync", "MPL"],
    ["Seafile", "https://www.seafile.com", "Fast self-hosted file sync", "AGPL"] ] },
  { names: ["Google Photos", "iCloud Photos", "Amazon Photos"], alts: [
    ["Immich", "https://immich.app", "Self-hosted photo & video backup", "AGPL"],
    ["PhotoPrism", "https://www.photoprism.app", "AI-powered photo library", "AGPL"] ] },
  { names: ["Google Analytics", "Mixpanel", "Hotjar"], alts: [
    ["Plausible", "https://plausible.io", "Privacy-friendly web analytics", "AGPL"],
    ["Umami", "https://umami.is", "Simple web analytics", "MIT"],
    ["Matomo", "https://matomo.org", "Full-featured analytics", "GPL"] ] },
  { names: ["1Password", "LastPass", "Dashlane", "Keeper", "NordPass"], alts: [
    ["Bitwarden", "https://bitwarden.com", "Password manager with sync", "GPL"],
    ["KeePassXC", "https://keepassxc.org", "Offline password manager", "GPL"],
    ["Vaultwarden", "https://github.com/dani-garcia/vaultwarden", "Self-hosted Bitwarden server", "AGPL"] ] },
  { names: ["Evernote", "OneNote", "Microsoft OneNote", "Google Keep", "Apple Notes", "Bear", "Simplenote"], alts: [
    ["Joplin", "https://joplinapp.org", "Notes with sync & web clipper", "AGPL"],
    ["Standard Notes", "https://standardnotes.com", "Encrypted notes", "AGPL"],
    ["Trilium Notes", "https://github.com/TriliumNext/Trilium", "Hierarchical knowledge base", "AGPL"] ] },
  { names: ["Notion", "Confluence", "Coda"], alts: [
    ["AppFlowy", "https://appflowy.io", "Notion-style workspace", "AGPL"],
    ["AFFiNE", "https://affine.pro", "Docs, whiteboards & databases", "MIT"],
    ["BookStack", "https://www.bookstackapp.com", "Team wiki", "MIT"] ] },
  { names: ["Obsidian", "Roam", "Roam Research"], alts: [
    ["Logseq", "https://logseq.com", "Outliner & linked notes", "AGPL"],
    ["Joplin", "https://joplinapp.org", "Markdown notes with sync", "AGPL"] ] },
  { names: ["Slack", "Microsoft Teams", "Teams"], alts: [
    ["Mattermost", "https://mattermost.com", "Team chat", "MIT"],
    ["Zulip", "https://zulip.com", "Threaded team chat", "Apache"],
    ["Element", "https://element.io", "Encrypted chat on Matrix", "AGPL"] ] },
  { names: ["Discord", "TeamSpeak"], alts: [
    ["Element", "https://element.io", "Communities on Matrix", "AGPL"],
    ["Mumble", "https://www.mumble.info", "Low-latency voice chat", "BSD"],
    ["Zulip", "https://zulip.com", "Community chat", "Apache"] ] },
  { names: ["WhatsApp", "Telegram", "Messenger", "Facebook Messenger", "iMessage", "Viber"], alts: [
    ["Signal", "https://signal.org", "Private messaging", "AGPL"],
    ["Element", "https://element.io", "Decentralised messaging on Matrix", "AGPL"] ] },
  { names: ["Zoom", "Google Meet", "Skype", "Webex", "GoToMeeting"], alts: [
    ["Jitsi Meet", "https://jitsi.org", "Video calls in the browser", "Apache"],
    ["BigBlueButton", "https://bigbluebutton.org", "Virtual classrooms", "LGPL"] ] },
  { names: ["TeamViewer", "AnyDesk", "Splashtop", "LogMeIn"], alts: [
    ["RustDesk", "https://rustdesk.com", "Remote desktop", "AGPL"] ] },
  { names: ["Trello", "Asana", "Monday", "monday.com", "ClickUp", "Basecamp"], alts: [
    ["Wekan", "https://wekan.github.io", "Kanban boards", "MIT"],
    ["Kanboard", "https://kanboard.org", "Minimal kanban", "MIT"],
    ["Vikunja", "https://vikunja.io", "Tasks, lists & boards", "AGPL"] ] },
  { names: ["Jira", "Linear", "Azure DevOps"], alts: [
    ["OpenProject", "https://www.openproject.org", "Project management", "GPL"],
    ["Plane", "https://plane.so", "Issue tracking", "AGPL"] ] },
  { names: ["Todoist", "TickTick", "Things", "Microsoft To Do", "Any.do"], alts: [
    ["Super Productivity", "https://super-productivity.com", "To-dos with time tracking", "MIT"],
    ["Vikunja", "https://vikunja.io", "Self-hosted to-do lists", "AGPL"] ] },
  { names: ["Airtable", "Smartsheet"], alts: [
    ["Baserow", "https://baserow.io", "No-code database", "MIT"],
    ["Grist", "https://www.getgrist.com", "Spreadsheet-database hybrid", "Apache"] ] },
  { names: ["Salesforce", "HubSpot", "Pipedrive", "Zoho CRM"], alts: [
    ["Twenty", "https://twenty.com", "Modern CRM", "AGPL"],
    ["SuiteCRM", "https://suitecrm.com", "Enterprise CRM", "AGPL"],
    ["EspoCRM", "https://www.espocrm.com", "Lightweight CRM", "AGPL"] ] },
  { names: ["Zapier", "Make", "IFTTT", "Power Automate"], alts: [
    ["Activepieces", "https://www.activepieces.com", "No-code automation", "MIT"],
    ["Node-RED", "https://nodered.org", "Flow-based automation", "Apache"],
    ["Huginn", "https://github.com/huginn/huginn", "Agents that watch & act for you", "MIT"] ] },
  { names: ["Calendly", "Doodle"], alts: [
    ["Cal.com", "https://cal.com", "Scheduling links", "AGPL"] ] },
  { names: ["Mailchimp", "ConvertKit", "Kit", "Sendinblue", "Brevo"], alts: [
    ["listmonk", "https://listmonk.app", "Newsletters & mailing lists", "AGPL"],
    ["Mautic", "https://mautic.org", "Marketing automation", "GPL"] ] },
  { names: ["Typeform", "Google Forms", "SurveyMonkey", "Jotform"], alts: [
    ["Formbricks", "https://formbricks.com", "Surveys & forms", "AGPL"],
    ["LimeSurvey", "https://www.limesurvey.org", "Advanced surveys", "GPL"] ] },
  { names: ["Intercom", "Zendesk", "Freshdesk", "Help Scout"], alts: [
    ["Chatwoot", "https://www.chatwoot.com", "Customer support inbox", "MIT"],
    ["Zammad", "https://zammad.org", "Helpdesk & ticketing", "AGPL"] ] },
  { names: ["Shopify", "BigCommerce"], alts: [
    ["WooCommerce", "https://woocommerce.com", "Store on WordPress", "GPL"],
    ["Medusa", "https://medusajs.com", "Headless commerce", "MIT"],
    ["PrestaShop", "https://prestashop.com", "Online store", "OSL"] ] },
  { names: ["Wix", "Squarespace", "Webflow", "Weebly"], alts: [
    ["WordPress", "https://wordpress.org", "Websites & blogs", "GPL"],
    ["Ghost", "https://ghost.org", "Publishing & newsletters", "MIT"] ] },
  { names: ["Medium", "Substack"], alts: [
    ["Ghost", "https://ghost.org", "Publishing, newsletters & memberships", "MIT"],
    ["WriteFreely", "https://writefreely.org", "Minimal federated blogging", "AGPL"] ] },
  { names: ["Twitter", "X", "Threads"], alts: [
    ["Mastodon", "https://joinmastodon.org", "Decentralised social network", "AGPL"] ] },
  { names: ["Instagram"], alts: [
    ["Pixelfed", "https://pixelfed.org", "Federated photo sharing", "AGPL"] ] },
  { names: ["Facebook"], alts: [
    ["Friendica", "https://friendi.ca", "Federated social network", "AGPL"],
    ["Mastodon", "https://joinmastodon.org", "Decentralised social network", "AGPL"] ] },
  { names: ["YouTube", "Vimeo"], alts: [
    ["PeerTube", "https://joinpeertube.org", "Federated video hosting", "AGPL"] ] },
  { names: ["Twitch"], alts: [
    ["Owncast", "https://owncast.online", "Self-hosted live streaming", "MIT"],
    ["PeerTube", "https://joinpeertube.org", "Federated video & live", "AGPL"] ] },
  { names: ["Reddit"], alts: [
    ["Lemmy", "https://join-lemmy.org", "Federated link aggregator", "AGPL"] ] },
  { names: ["Netflix", "Plex", "Emby"], alts: [
    ["Jellyfin", "https://jellyfin.org", "Your own media server", "GPL"],
    ["Kodi", "https://kodi.tv", "Media center", "GPL"] ] },
  { names: ["Spotify", "Apple Music", "iTunes"], alts: [
    ["Navidrome", "https://www.navidrome.org", "Stream your own music library", "GPL"] ] },
  { names: ["Google Maps", "Apple Maps", "Waze"], alts: [
    ["Organic Maps", "https://organicmaps.app", "Offline maps & navigation", "Apache"],
    ["OsmAnd", "https://osmand.net", "Offline maps for outdoors", "GPL"],
    ["OpenStreetMap", "https://www.openstreetmap.org", "The open world map", "ODbL"] ] },
  { names: ["Google", "Google Search", "Bing"], alts: [
    ["SearXNG", "https://docs.searxng.org", "Self-hosted meta search engine", "AGPL"] ] },
  { names: ["ChatGPT", "Gemini", "Google Gemini", "Microsoft Copilot"], alts: [
    ["Ollama", "https://ollama.com", "Run open AI models locally", "MIT"],
    ["Jan", "https://jan.ai", "Offline ChatGPT-style app", "Apache"],
    ["GPT4All", "https://www.nomic.ai/gpt4all", "Local AI chat on your computer", "MIT"],
    ["LibreChat", "https://www.librechat.ai", "Self-hosted multi-model chat", "MIT"] ] },
  { names: ["GitHub Copilot", "Copilot", "Cursor", "Tabnine"], alts: [
    ["Continue", "https://www.continue.dev", "AI coding assistant for your editor", "Apache"],
    ["Tabby", "https://github.com/TabbyML/tabby", "Self-hosted code completion", "Apache"] ] },
  { names: ["GitHub", "Bitbucket"], alts: [
    ["Forgejo", "https://forgejo.org", "Community-run code hosting", "GPL"],
    ["Gitea", "https://about.gitea.com", "Lightweight code hosting", "MIT"],
    ["GitLab CE", "https://about.gitlab.com/install/", "Full DevOps platform", "MIT"] ] },
  { names: ["VS Code", "Visual Studio Code", "Sublime Text"], alts: [
    ["VSCodium", "https://vscodium.com", "VS Code without telemetry", "MIT"],
    ["Zed", "https://zed.dev", "Fast collaborative editor", "GPL"] ] },
  { names: ["Postman", "Insomnia"], alts: [
    ["Bruno", "https://www.usebruno.com", "Offline API client", "MIT"],
    ["Hoppscotch", "https://hoppscotch.io", "Web API client", "MIT"] ] },
  { names: ["Docker Desktop"], alts: [
    ["Podman Desktop", "https://podman-desktop.io", "Containers on your desktop", "Apache"],
    ["Rancher Desktop", "https://rancherdesktop.io", "Containers & Kubernetes", "Apache"] ] },
  { names: ["Heroku", "Vercel", "Netlify", "Render"], alts: [
    ["Coolify", "https://coolify.io", "Self-hosted app platform", "Apache"],
    ["Dokku", "https://dokku.com", "Mini-Heroku on your server", "MIT"] ] },
  { names: ["WinRAR", "WinZip"], alts: [
    ["7-Zip", "https://www.7-zip.org", "File archiver", "LGPL"],
    ["PeaZip", "https://peazip.github.io", "Archiver with a friendly UI", "LGPL"] ] },
  { names: ["Grammarly", "QuillBot"], alts: [
    ["LanguageTool", "https://languagetool.org", "Grammar & style checker", "LGPL"] ] },
  { names: ["Adobe Audition", "Audition", "GarageBand"], alts: [
    ["Audacity", "https://www.audacityteam.org", "Audio editor", "GPL"] ] },
  { names: ["Ableton", "Ableton Live", "FL Studio", "Logic Pro", "Pro Tools", "Cubase"], alts: [
    ["Ardour", "https://ardour.org", "Pro audio workstation", "GPL"],
    ["LMMS", "https://lmms.io", "Beat & music production", "GPL"] ] },
  { names: ["Loom", "Snagit", "Bandicam"], alts: [
    ["OBS Studio", "https://obsproject.com", "Recording & streaming", "GPL"],
    ["ShareX", "https://getsharex.com", "Screenshots & screen recording (Windows)", "GPL"],
    ["Flameshot", "https://flameshot.org", "Screenshots with annotation", "GPL"] ] },
  { names: ["Google Translate", "DeepL"], alts: [
    ["LibreTranslate", "https://libretranslate.com", "Self-hostable translation", "AGPL"] ] },
  { names: ["Kindle", "Apple Books"], alts: [
    ["Calibre", "https://calibre-ebook.com", "E-book library & converter", "GPL"],
    ["KOReader", "https://koreader.rocks", "E-book reader", "AGPL"] ] },
  { names: ["Miro", "Lucidchart", "Visio", "Microsoft Visio", "Mural"], alts: [
    ["Excalidraw", "https://excalidraw.com", "Hand-drawn style whiteboard", "MIT"],
    ["draw.io", "https://www.drawio.com", "Diagrams & flowcharts", "Apache"] ] },
  { names: ["Feedly", "Inoreader"], alts: [
    ["FreshRSS", "https://freshrss.org", "Self-hosted RSS reader", "AGPL"],
    ["Miniflux", "https://miniflux.app", "Minimal RSS reader", "Apache"] ] },
  { names: ["Pocket", "Instapaper"], alts: [
    ["wallabag", "https://wallabag.org", "Read-it-later", "MIT"] ] },
  { names: ["Authy", "Google Authenticator", "Microsoft Authenticator"], alts: [
    ["Aegis", "https://getaegis.app", "2FA codes (Android)", "GPL"],
    ["2FAS", "https://2fas.com", "2FA codes (Android & iOS)", "GPL"] ] },
  { names: ["YNAB", "Mint", "Quicken"], alts: [
    ["Actual Budget", "https://actualbudget.org", "Envelope budgeting", "MIT"],
    ["Firefly III", "https://www.firefly-iii.org", "Personal finance manager", "AGPL"] ] },
  { names: ["QuickBooks", "Xero"], alts: [
    ["GnuCash", "https://www.gnucash.org", "Accounting for personal & small business", "GPL"] ] },
];

// Ways people ask for alternatives; the first group is the product.
const ALT_PATTERNS = [
  /^(?:what (?:are|is) )?(?:the )?(?:best |good |free |foss |floss |open[- ]?source |oss |libre |self[- ]?hosted )*alternatives? (?:to|for) (.+?)\??$/i,
  /^(.+?) (?:open[- ]?source |foss |floss |free |oss |self[- ]?hosted )+(?:alternatives?|replacements?|equivalents?|version)\??$/i,
  /^(.+?) (?:alternatives?|replacements?)\??$/i,
  /^(?:open[- ]?source|foss|floss|oss|libre|self[- ]?hosted) (?:version of |equivalent (?:of|to) |alternative (?:of|to) )?(.+?)\??$/i,
  /^(?:replace|replacement for|something like|like) (.+?)(?: but (?:open[- ]?source|free|foss))?\??$/i,
];
