import re, csv, collections
DUMP = '/Users/wesleyroos/Downloads/landcjnqjh_wp00fd.sql'
WANT = {'wp_wc_customer_lookup','wp_comments','wp_e_submissions','wp_e_submissions_values','wp_users','wp_postmeta'}

def parse_tuples(s):
    """Parse (a,b,c),(d,e,f) value lists respecting quotes/escapes."""
    rows, cur, field, depth, i, q = [], [], [], 0, 0, None
    while i < len(s):
        c = s[i]
        if q:
            if c == '\\': field.append(s[i:i+2]); i += 2; continue
            if c == q: q = None
            else: field.append(c)
        else:
            if c == "'": q = c
            elif c == '(': 
                if depth == 0: cur, field = [], []
                else: field.append(c)
                depth += 1
            elif c == ')':
                depth -= 1
                if depth == 0: cur.append(''.join(field)); rows.append(cur)
                else: field.append(c)
            elif c == ',' and depth == 1: cur.append(''.join(field)); field = []
            elif depth >= 1: field.append(c)
        i += 1
    return rows

# collect column orders from CREATE TABLE, then rows from INSERTs
cols, data = {}, collections.defaultdict(list)
create_re = re.compile(r'CREATE TABLE `(\w+)`')
col_re = re.compile(r'^\s*`(\w+)`')
ins_re = re.compile(r'INSERT INTO `(\w+)`(?:\s*\(([^)]*)\))?\s*VALUES\s*(.*);?\s*$', re.S)

with open(DUMP, encoding='utf-8', errors='replace') as f:
    cur_create = None
    buf, buf_table = None, None
    for line in f:
        m = create_re.match(line)
        if m: cur_create = m.group(1); cols[cur_create] = []; continue
        if cur_create:
            cm = col_re.match(line)
            if cm: cols[cur_create].append(cm.group(1))
            if line.startswith(')'): cur_create = None
            continue
        if buf is not None:
            buf += line
            if line.rstrip().endswith(';'):
                m2 = ins_re.match(buf)
                if m2 and m2.group(1) in WANT:
                    c = [x.strip(' `') for x in m2.group(2).split(',')] if m2.group(2) else cols.get(m2.group(1))
                    for r in parse_tuples(m2.group(3)):
                        if c and len(r) == len(c): data[m2.group(1)].append(dict(zip(c, r)))
                buf = None
            continue
        if line.startswith('INSERT INTO'):
            t = line.split('`')[1]
            if t in WANT:
                if line.rstrip().endswith(';'):
                    m2 = ins_re.match(line)
                    if m2:
                        c = [x.strip(' `') for x in m2.group(2).split(',')] if m2.group(2) else cols.get(t)
                        for r in parse_tuples(m2.group(3)):
                            if c and len(r) == len(c): data[t].append(dict(zip(c, r)))
                else:
                    buf = line

for t in WANT: print(t, len(data[t]), 'rows')

EMAIL = re.compile(r'^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$')
INTERNAL = re.compile(r'(wesley|grodigital|landcruisersa|fundi)', re.I)
out = {}  # email -> {name, sources, extra}
def add(email, name, source, extra=''):
    email = (email or '').lower().strip()
    if not EMAIL.match(email) or INTERNAL.search(email): return
    rec = out.setdefault(email, {'name':'', 'sources':set(), 'extra':''})
    if name and not rec['name']: rec['name'] = name.strip()
    rec['sources'].add(source)
    if extra and not rec['extra']: rec['extra'] = extra

# 1. shop customers (best tier)
for r in data['wp_wc_customer_lookup']:
    add(r.get('email'), f"{r.get('first_name','')} {r.get('last_name','')}".strip(), 'shop_customer', f"registered {r.get('date_registered','')[:10]}")
# 2. billing emails from orders
bill_name = {}
for r in data['wp_postmeta']:
    if r.get('meta_key') == '_billing_email': add(r.get('meta_value'), '', 'order_billing')
for r in data['wp_postmeta']:
    if r.get('meta_key') in ('_billing_first_name',): bill_name[r.get('post_id')] = r.get('meta_value')
# 3. Elementor form submissions: join values by submission
subs = collections.defaultdict(dict)
for r in data['wp_e_submissions_values']:
    subs[r.get('submission_id')][r.get('key','').lower()] = r.get('value','')
for sid, kv in subs.items():
    email = next((v for k,v in kv.items() if '@' in (v or '') and ('mail' in k or EMAIL.match(v or ''))), None)
    name = next((v for k,v in kv.items() if 'name' in k and v and '@' not in v), '')
    if email: add(email, name, 'contact_form')
# 4. approved comments only
for r in data['wp_comments']:
    if r.get('comment_approved') == '1':
        add(r.get('comment_author_email'), r.get('comment_author',''), 'comment_approved')
# 5. registered users
for r in data['wp_users']:
    add(r.get('user_email'), r.get('display_name',''), 'wp_user')

tiers = [('shop_customer',),('order_billing',),('contact_form',),('wp_user',),('comment_approved',)]
def tier(rec):
    for i,(t,) in enumerate(tiers):
        if t in rec['sources']: return i
    return 9
rows = sorted(out.items(), key=lambda kv: (tier(kv[1]), kv[0]))
with open('/Users/wesleyroos/Downloads/lcsa-mailing-list-seed.csv','w',newline='') as f:
    w = csv.writer(f); w.writerow(['email','name','sources','note'])
    for e, rec in rows: w.writerow([e, rec['name'], '+'.join(sorted(rec['sources'])), rec['extra']])
c = collections.Counter('+'.join(sorted(r['sources'])) for _, r in rows)
print('\nfinal unique external emails:', len(rows))
for k,v in c.most_common(): print(f'  {k}: {v}')
