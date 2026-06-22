import re

# 1. Read index.html to extract CSS and JS
with open('index.html', 'r', encoding='utf-8') as f:
    index_content = f.read()

# Extract CSS
css_match = re.search(r'(<style>.*?</style>)', index_content, re.DOTALL)
if not css_match:
    print("Error: Could not find CSS in index.html")
    exit(1)
css_block = css_match.group(1)

# Extract JS
# Find start of imports
js_start_idx = index_content.find('import { initializeApp }')
# Find end of quiz block
js_end_idx = index_content.find('    document.body.classList.add(\'quiz-page\');')

if js_start_idx == -1 or js_end_idx == -1:
    print("Error: Could not find JS boundaries in index.html")
    exit(1)

js_block = index_content[js_start_idx:js_end_idx]

def bundle_file(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Replace CSS
    content = re.sub(r'<link rel="stylesheet" href="css/style\.css">', css_block, content)
    
    # Replace JS imports
    # In quiz-player.html:
    # import { playSuccessSound } from './js/sounds.js';
    # import './js/quiz.js';
    # In quiz-admin.html:
    # import { auth } from './js/firebase-config.js';
    # import { onAuthStateChanged } ...
    # import { playSuccessSound } ...
    # import './js/quiz.js';
    
    # We can just remove all these specific imports and inject our js_block
    content = re.sub(r"import \{ auth \} from '\./js/firebase-config\.js';\n", "", content)
    content = re.sub(r'import \{ onAuthStateChanged \} from "https://www\.gstatic\.com/firebasejs/10\.7\.0/firebase-auth\.js";\n', "", content)
    content = re.sub(r"import \{ playSuccessSound \} from '\./js/sounds\.js';\n", "", content)
    content = re.sub(r"import '\./js/quiz\.js';\n", "", content)
    
    # Wait, where do we inject js_block? We should inject it right after <script type="module">\n
    content = re.sub(r'(<script type="module">)', r'\1\n' + js_block.replace('\\', '\\\\'), content, count=1)
    
    return content

# 2. Bundle quiz-player.html -> new_index.html
new_index = bundle_file('quiz-player.html')
with open('new_index.html', 'w', encoding='utf-8') as f:
    f.write(new_index)

# 3. Bundle quiz-admin.html -> new_admin.html
new_admin = bundle_file('quiz-admin.html')
with open('new_admin.html', 'w', encoding='utf-8') as f:
    f.write(new_admin)

print("Bundling successful!")
