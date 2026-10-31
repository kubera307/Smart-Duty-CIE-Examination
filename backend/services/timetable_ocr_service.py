import re
import os
import io
from PIL import Image, ImageOps, ImageEnhance
from models import db, Faculty, Semester, Subject

# Department Faculty & Extended Faculty Roster
INITIALS_TO_NAMES = {
    'ABC': 'Dr. Arjun B C',
    'HYS': 'Dr. Swathi H Y',
    'SMV': 'Mrs. Sushma M V',
    'ANS': 'Mrs. Ankitha S',
    'MHC': 'Mrs. Megha H C',
    'MB':  'Mrs. Maseeha Banu',
    'SDN': 'Mrs. Sheethal D N',
    'AGN': 'Dr. Adithya G N',
    'SSG': 'Prof. S. S. Girish',
    'AKP': 'Prof. A. K. Parvathi',
    'MPJ': 'Mr. Manikantha Prasad J'
}

INITIALS_ALIASES = {
    'LVB': 'MB',
    'IVB': 'MB',
    'KITHAS': 'ANS',
    'ANKITHA': 'ANS',
    'ARJUN': 'ABC',
    'MPJ': 'MPJ',
    'NWJ': 'MPJ',
    'NQJ': 'MPJ',
    'SSG': 'SSG',
    'AKP': 'AKP',
    'SHEETHAL': 'SDN',
    'SHITHAL': 'SDN',
    'SWATHI': 'HYS',
    'SUSHMA': 'SMV',
    'MEGHA': 'MHC'
}

# Canonical subjects with corrected names and credits
KNOWN_SPECIAL_SUBJECTS = {
    # 3rd Semester
    '24MAAI301': {'name': 'Mathematics for AI&ML', 'ltp': '2-2-0', 'credits': '3', 'faculty': 'SSG'},
    '24AI302': {'name': 'Digital Design and Computer Organization', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'MPJ'},
    '24AI303': {'name': 'Operating Systems', 'ltp': '3-0-2', 'credits': '4', 'faculty': 'SDN'},
    '24AI304': {'name': 'Data Structures and Applications', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'MB'},
    '24AI305': {'name': 'Introduction to Artificial Intelligence', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'ABC'},
    '24AI306A': {'name': 'Python for Data Science', 'ltp': '2-0-2', 'credits': '3', 'faculty': 'HYS'},
    '24AI307A': {'name': 'Data Visualization using Tableau and Power BI', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'ANS'},
    '24AIL308': {'name': 'Data Structures Lab', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'MB'},
    '24SCR':  {'name': 'Social Connect and Responsibility', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'MHC'},
    '24NYP1': {'name': 'NSS, YOGA, PE', 'ltp': '0-0-2', 'credits': 'Audit', 'faculty': 'ANS'},
    '24BCM':  {'name': 'Bridge Course Mathematics (MC for Diploma students)', 'ltp': '3-0-0', 'credits': 'Audit', 'faculty': 'AKP'},
    '25BCM301': {'name': 'Bridge Mathematics-I', 'ltp': '3-0-0', 'credits': 'Audit', 'faculty': 'AKP'},
    '25NYP1': {'name': 'NSS, YOGA, PE', 'ltp': '0-0-2', 'credits': 'Audit', 'faculty': 'MB'},
    '25SCR':  {'name': 'Community Project / Societal Project', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'MHC'},

    # 5th Semester
    '24AI501': {'name': 'Software Engineering & Project Management', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'ABC'},
    '24AI502': {'name': 'Database Management Systems', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'ANS'},
    '24AI503': {'name': 'Computer Networks', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'SDN'},
    '24AI504': {'name': 'Deep Learning', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'HYS'},
    '24AI505A': {'name': 'Computer Graphics and Image Processing', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'SMV'},
    '24AIL506': {'name': 'DBMS and Networks Lab', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'ANS'},
    '24AIL507': {'name': 'Deep Learning Lab', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'HYS'},

    # 7th Semester
    '23AI701': {'name': 'Internet of Things', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'SDN'},
    '23AI702': {'name': 'Natural Language Processing', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'HYS'},
    '23AI703': {'name': 'Cloud Computing', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'MHC'},
    '23AI704D': {'name': 'AI for Predictive Analytics and IoT', 'ltp': '3-0-0', 'credits': '3', 'faculty': 'ANS'},
    '23AIL705': {'name': 'NLP and Cloud Computing Lab', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'HYS'},
    '23AIP706': {'name': 'Project Work Phase-1', 'ltp': '0-0-4', 'credits': '2', 'faculty': 'ABC'}
}

def clean_subject_name(raw_name):
    if not raw_name:
        return ""
    name = raw_name.strip()
    name = name.replace('IntroducGon', 'Introduction')
    name = name.replace('Introducon', 'Introduction')
    name = name.replace('Compu(er', 'Computer')
    name = name.replace('Orguni1.11tion', 'Organization')
    name = name.replace('Enginccring', 'Engineering')
    name = name.replace('Data Scicnce', 'Data Science')
    name = re.sub(r'\s+', ' ', name)
    return name

def normalize_subject_code(raw_code):
    if not raw_code:
        return ""
    code = raw_code.strip().upper()
    # Replace common OCR misreads: '1' instead of 'I' in prefix
    code = re.sub(r'^(2[3-6])A1', r'\1AI', code)
    code = re.sub(r'^(2[3-6])MAA1', r'\1MAAI', code)
    code = re.sub(r'^(2[3-6])AIL', r'\1AIL', code)
    # Fix elective/lab trailing OCR digit like 24AI3061 -> 24AI306A or 24AI3071 -> 24AI307A
    if code == '24AI3061':
        code = '24AI306A'
    elif code == '24AI3071':
        code = '24AI307A'
    elif code == '24A1306A':
        code = '24AI306A'
    elif code == '24A1307A':
        code = '24AI307A'
    elif code == '24A1302':
        code = '24AI302'
    elif code == '24A1303':
        code = '24AI303'
    elif code == '24A1304':
        code = '24AI304'
    elif code == '24A1305':
        code = '24AI305'
    return code

def _extract_period_schedule(words, first_day_y):
    time_pattern = re.compile(r'(?<!\d)(\d{1,2})[:.](\d{2})(?!\d)')
    time_tokens = []

    for word in words:
        if word['y'] < first_day_y - 320 or word['y'] >= first_day_y or not 600 <= word['cx'] <= 2600:
            continue
        for match in time_pattern.finditer(word['text']):
            time_tokens.append({
                'x': word['cx'],
                'y': word['y'],
                'order': match.start(),
                'value': int(match.group(1)) * 60 + int(match.group(2))
            })

    time_tokens.sort(key=lambda token: token['x'])
    columns = []
    for token in time_tokens:
        if not columns or token['x'] - columns[-1]['center'] > 100:
            columns.append({'center': token['x'], 'tokens': [token]})
        else:
            column = columns[-1]
            column['tokens'].append(token)
            column['center'] = sum(item['x'] for item in column['tokens']) / len(column['tokens'])

    headers = []
    previous_start = None
    for column in columns:
        tokens = sorted(column['tokens'], key=lambda token: (token['y'], token['order']))
        if len(tokens) < 2:
            continue

        start = tokens[0]['value']
        end = tokens[-1]['value']
        if previous_start is not None:
            while start < previous_start:
                start += 12 * 60
        while end <= start:
            end += 12 * 60

        headers.append({
            'center': column['center'],
            'start': start,
            'end': end
        })
        previous_start = start

    period_schedule = {}
    class_headers = []
    for index, header in enumerate(headers):
        next_header = headers[index + 1] if index + 1 < len(headers) else None
        is_short_break = header['end'] - header['start'] <= 30
        is_lunch_break = (
            next_header is not None
            and header['end'] - header['start'] >= 45
            and header['start'] >= 12 * 60
            and next_header['start'] - header['end'] >= 30
        )
        if not is_short_break and not is_lunch_break:
            class_headers.append(header)

    for period_id, header in zip(
        ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        class_headers
    ):
        period_schedule[period_id] = {
            'start_time': f"{header['start'] // 60:02d}:{header['start'] % 60:02d}",
            'end_time': f"{header['end'] // 60:02d}:{header['end'] % 60:02d}",
            'center': header['center']
        }

    return period_schedule

def parse_timetable_from_image(image_file_or_bytes):
    """
    Parses an institutional timetable circular image into structured weekly timetable slots.
    Handles images (PNG, JPEG, WEBP) as well as PDFs with dynamic resolution normalization,
    contrast enhancement, and robust timetable slot alignment.
    """
    try:
        import winocr
    except ImportError:
        winocr = None

    img = None
    # 1. Load image (handling raw bytes, file-like objects, paths, or PDF bytes)
    if isinstance(image_file_or_bytes, (bytes, bytearray)):
        if image_file_or_bytes.startswith(b'%PDF'):
            import pymupdf
            doc = pymupdf.open(stream=image_file_or_bytes, filetype="pdf")
            page = doc[0]
            pix = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
        else:
            img = Image.open(io.BytesIO(image_file_or_bytes))
    elif hasattr(image_file_or_bytes, 'read'):
        content = image_file_or_bytes.read()
        if content.startswith(b'%PDF'):
            import pymupdf
            doc = pymupdf.open(stream=content, filetype="pdf")
            page = doc[0]
            pix = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
        else:
            img = Image.open(io.BytesIO(content))
    elif isinstance(image_file_or_bytes, str) and os.path.exists(image_file_or_bytes):
        if image_file_or_bytes.lower().endswith('.pdf'):
            import pymupdf
            doc = pymupdf.open(image_file_or_bytes)
            page = doc[0]
            pix = page.get_pixmap(dpi=300)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
        else:
            img = Image.open(image_file_or_bytes)
    else:
        raise ValueError("Invalid image input provided to parse_timetable_from_image")

    # 2. Preprocess & Normalize Image
    img = ImageOps.exif_transpose(img)
    if img.mode != 'RGB':
        img = img.convert('RGB')

    orig_w, orig_h = img.size
    # Target reference width is 2700px for uniform coordinate mapping
    target_w = 2700
    scale = target_w / float(orig_w)
    target_h = int(orig_h * scale)
    img_scaled = img.resize((target_w, target_h), Image.Resampling.LANCZOS)

    # Enhance contrast and sharpness for maximum OCR clarity
    enhancer = ImageEnhance.Contrast(img_scaled)
    img_enhanced = enhancer.enhance(1.35)
    sharpener = ImageEnhance.Sharpness(img_enhanced)
    img_ready = sharpener.enhance(1.25)

    # 3. Run OCR
    words = []
    lines_text = []
    if winocr:
        ocr_res = winocr.recognize_pil_sync(img_ready)
        for line in ocr_res.get('lines', []):
            line_str = line.get('text', '').strip()
            if line_str:
                lines_text.append(line_str)
            for w in line.get('words', []):
                rect = w.get('bounding_rect', {})
                txt = w.get('text', '').strip()
                if txt:
                    words.append({
                        'text': txt,
                        'x': float(rect.get('x', 0)),
                        'y': float(rect.get('y', 0)),
                        'w': float(rect.get('width', 0)),
                        'h': float(rect.get('height', 0)),
                        'cx': float(rect.get('x', 0)) + float(rect.get('width', 0)) / 2.0,
                        'cy': float(rect.get('y', 0)) + float(rect.get('height', 0)) / 2.0
                    })
    else:
        raise RuntimeError("winocr is required for timetable OCR parsing on this system")

    full_text = " ".join(w['text'] for w in words)

    # 4. Detect Semester Number
    detected_sem_num = None
    if re.search(r'\b(?:III|Ill|111|3rd|3)\s*(?:Semester|Sentes|Sem)', full_text, re.I):
        detected_sem_num = 3
    elif re.search(r'\b(?:IV|1V|4th|4)\s*(?:Semester|Sentes|Sem)', full_text, re.I):
        detected_sem_num = 4
    elif re.search(r'\b(?:V|5th|5)\s*(?:Semester|Sentes|Sem)', full_text, re.I):
        detected_sem_num = 5
    elif re.search(r'\b(?:VI|V1|6th|6)\s*(?:Semester|Sentes|Sem)', full_text, re.I):
        detected_sem_num = 6
    elif re.search(r'\b(?:VII|V11|7th|7)\s*(?:Semester|Sentes|Sem)', full_text, re.I):
        detected_sem_num = 7

    # 5. Detect Classroom & Lab
    cr_match = re.search(r'Classroom\s*:\s*([A-Z0-9]+)', full_text, re.I)
    detected_classroom = cr_match.group(1).replace('J', 'I').replace('O', '0') if cr_match else ('AI302' if detected_sem_num == 3 else 'AI301')

    detected_lab = 'SA-205 / MB-202' if ('SA-205' in full_text or 'MB-202' in full_text) else 'SA-205'

    # 6. Detect Legend Table (Subject code -> Subject name -> Faculty Initials)
    legend_words = [w for w in words if w['y'] >= 1520 and w['y'] < 3050]
    legend_words.sort(key=lambda w: w['y'])

    legend_rows = []
    current_row = []
    for w in legend_words:
        if not current_row:
            current_row.append(w)
        else:
            avg_y = sum(item['y'] for item in current_row) / len(current_row)
            if abs(w['y'] - avg_y) <= 45:
                current_row.append(w)
            else:
                legend_rows.append(current_row)
                current_row = [w]
    if current_row:
        legend_rows.append(current_row)

    legend_map = {}  # code -> { name, faculty_initials, ltp, credits }
    code_regex = re.compile(r'^(2[3-6][A-Z0-9]+)$', re.I)

    for r in legend_rows:
        r.sort(key=lambda w: w['x'])
        first_word = r[0]['text'].strip().upper()
        norm_first = normalize_subject_code(first_word)
        if code_regex.match(norm_first):
            fac_words = [w['text'].replace(',', '').strip().upper() for w in r if w['x'] >= 2040]
            ltp_words = [w['text'] for w in r if 1680 <= w['x'] < 1850]
            credit_words = [w['text'] for w in r if 1850 <= w['x'] < 2040]
            name_words = [w['text'] for w in r if 640 <= w['x'] < 1680]

            name = clean_subject_name(" ".join(name_words))
            ltp = ltp_words[0] if ltp_words else "3-0-0"
            credits_val = credit_words[0] if credit_words else "3"

            cleaned_fac = []
            for fw in fac_words:
                f_clean = re.sub(r'[^A-Z]', '', fw)
                if not f_clean:
                    continue
                mapped = INITIALS_ALIASES.get(f_clean, f_clean)
                if mapped in INITIALS_TO_NAMES:
                    cleaned_fac.append(mapped)

            legend_map[norm_first] = {
                'code': norm_first,
                'name': name,
                'ltp': ltp,
                'credits': credits_val,
                'faculty_initials': cleaned_fac
            }

    # Inject or refine known special subjects
    for k_code, k_info in KNOWN_SPECIAL_SUBJECTS.items():
        if k_code not in legend_map:
            legend_map[k_code] = {
                'code': k_code,
                'name': k_info['name'],
                'ltp': k_info['ltp'],
                'credits': k_info['credits'],
                'faculty_initials': [k_info['faculty']]
            }
        else:
            # If name was parsed partially or with OCR typo, use clean known canonical title
            cur_entry = legend_map[k_code]
            if not cur_entry.get('name') or len(cur_entry.get('name', '')) < 5:
                cur_entry['name'] = k_info['name']
            else:
                cur_entry['name'] = clean_subject_name(cur_entry['name'])
            if not cur_entry.get('faculty_initials'):
                cur_entry['faculty_initials'] = [k_info['faculty']]

    # 7. Detect Day Rows (Monday through Saturday)
    days_map = {
        'monday': 'MON', 'mon': 'MON',
        'tuesday': 'TUE', 'tue': 'TUE',
        'wednesday': 'WED', 'wed': 'WED', 'wednesdny': 'WED',
        'thursday': 'THU', 'thu': 'THU',
        'friday': 'FRI', 'fri': 'FRI',
        'saturday': 'SAT', 'sat': 'SAT'
    }

    detected_days = []
    for w in words:
        clean = re.sub(r'[^a-zA-Z]', '', w['text'].lower())
        if clean in days_map and w['x'] < 600:
            detected_days.append({
                'day': days_map[clean],
                'y': w['y'],
                'cy': w['cy'],
                'x': w['x']
            })

    detected_days.sort(key=lambda d: d['y'])
    unique_days = []
    seen = set()
    for d in detected_days:
        if d['day'] not in seen:
            seen.add(d['day'])
            unique_days.append(d)

    period_schedule = _extract_period_schedule(words, unique_days[0]['y']) if unique_days else {}

    def period_time_range(period_id, fallback):
        period = period_schedule.get(period_id)
        if not period:
            return fallback
        return period['start_time'], period['end_time']

    p2_lab_end = period_time_range('p3', ('12:00', '13:00'))[1]
    p4_lab_end = period_time_range('p5', ('15:00', '16:00'))[1]
    period_order = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6']

    # Pre-fetch database faculty for matching
    all_faculty = Faculty.query.all()

    def resolve_faculty(initials_list, default_sub_code=""):
        norm_code = normalize_subject_code(default_sub_code)

        # 1. Match initials in initials_list
        for init in initials_list:
            mapped_init = INITIALS_ALIASES.get(init, init)
            full_name = INITIALS_TO_NAMES.get(mapped_init)
            if full_name:
                for f in all_faculty:
                    if f.name.lower().strip() == full_name.lower().strip():
                        return f
                    if any(part in f.name.lower() for part in full_name.lower().split() if len(part) > 2):
                        return f
            for f in all_faculty:
                if f.login_id and f.login_id.lower() == mapped_init.lower():
                    return f

        # 2. Check canonical known subject faculty
        if norm_code in KNOWN_SPECIAL_SUBJECTS:
            def_init = KNOWN_SPECIAL_SUBJECTS[norm_code].get('faculty')
            if def_init:
                full_name = INITIALS_TO_NAMES.get(def_init)
                if full_name:
                    for f in all_faculty:
                        if full_name.lower() in f.name.lower() or any(part in f.name.lower() for part in full_name.lower().split() if len(part) > 3):
                            return f

        # 3. Subject-based faculty assignment heuristics for Department of CSE (AI & ML)
        sub_upper = norm_code.upper()
        if '304' in sub_upper or '308' in sub_upper or 'NYP' in sub_upper:
            m = next((f for f in all_faculty if 'maseeha' in f.name.lower()), None)
            if m: return m
        if '302' in sub_upper:
            s = next((f for f in all_faculty if 'swathi' in f.name.lower()), None)
            if s: return s
        if '303' in sub_upper or '503' in sub_upper or '701' in sub_upper:
            sh = next((f for f in all_faculty if 'sheethal' in f.name.lower() or 'shithal' in f.name.lower()), None)
            if sh: return sh
        if '305' in sub_upper or '501' in sub_upper or '706' in sub_upper:
            ar = next((f for f in all_faculty if 'arjun' in f.name.lower()), None)
            if ar: return ar
        if '306' in sub_upper or '504' in sub_upper or '702' in sub_upper:
            sw = next((f for f in all_faculty if 'swathi' in f.name.lower()), None)
            if sw: return sw
        if '307' in sub_upper or '502' in sub_upper or '704' in sub_upper:
            an = next((f for f in all_faculty if 'ankitha' in f.name.lower()), None)
            if an: return an
        if '505' in sub_upper:
            sm = next((f for f in all_faculty if 'sushma' in f.name.lower()), None)
            if sm: return sm
        if 'SCR' in sub_upper or '703' in sub_upper:
            mg = next((f for f in all_faculty if 'megha' in f.name.lower()), None)
            if mg: return mg
        if 'MAAI' in sub_upper or 'BCM' in sub_upper:
            an = next((f for f in all_faculty if 'ankitha' in f.name.lower()), None)
            if an: return an

        return all_faculty[0] if all_faculty else None

    # Pre-fetch subjects for the detected semester
    semester_record = None
    if detected_sem_num:
        semester_record = Semester.query.filter_by(sem_number=detected_sem_num).first()
    db_subjects = Subject.query.filter_by(semester_id=semester_record.id).all() if semester_record else Subject.query.all()
    db_subjects_by_code = {s.code.upper(): s for s in db_subjects}

    # 8. Grid mapping across detected days
    grid_data = {
        'MON': {}, 'TUE': {}, 'WED': {}, 'THU': {}, 'FRI': {}, 'SAT': {}
    }
    entries_list = []

    for i, d in enumerate(unique_days):
        day_key = d['day']
        y_start = d['y'] - 30
        y_end = unique_days[i+1]['y'] - 30 if i + 1 < len(unique_days) else d['y'] + 100

        row_words = [w for w in words if y_start <= w['cy'] <= y_end and w['x'] > d['x'] + 50]

        # Find subject code tokens in this row
        code_tokens = []
        for rw in sorted(row_words, key=lambda w: w['x']):
            norm_c = normalize_subject_code(rw['text'])
            if code_regex.match(norm_c) or norm_c in legend_map or norm_c in KNOWN_SPECIAL_SUBJECTS:
                code_tokens.append({
                    'code': norm_c,
                    'x': rw['x'],
                    'cx': rw['cx']
                })

        covered_periods = set()

        for token in code_tokens:
            code = token['code']
            x = token['x']

            # Determine period & duration
            period_id = None
            is_lab = False
            duration = 1
            start_time = "09:30"
            end_time = "10:30"

            if period_schedule:
                period_id = min(
                    period_schedule,
                    key=lambda key: abs(x - period_schedule[key]['center'])
                )
                start_time, end_time = period_time_range(period_id, ('09:30', '10:30'))
            elif 650 <= x <= 980:
                period_id = 'p1'
                start_time, end_time = ('09:30', '10:30')
            elif 1220 <= x <= 1340:
                period_id = 'p2'
                is_lab = True
                duration = 2
                start_time, end_time = ('11:00', '13:00')
                covered_periods.add('p3')
            elif 1000 <= x < 1220:
                period_id = 'p2'
                start_time, end_time = ('11:00', '12:00')
            elif 1340 < x <= 1640:
                if 'p3' not in covered_periods:
                    period_id = 'p3'
                    start_time, end_time = ('12:00', '13:00')
            elif 1860 <= x <= 1980:
                period_id = 'p4'
                is_lab = True
                duration = 2
                start_time, end_time = ('14:00', '16:00')
                covered_periods.add('p5')
            elif 1660 <= x < 1860:
                period_id = 'p4'
                start_time, end_time = ('14:00', '15:00')
            elif 1980 < x <= 2200:
                if 'p5' not in covered_periods:
                    period_id = 'p5'
                    start_time, end_time = ('15:00', '16:00')
            elif 2200 < x <= 2500:
                period_id = 'p6'
                start_time, end_time = ('16:00', '17:00')

            if not period_id:
                continue
            if period_id in covered_periods:
                continue

            period_index = period_order.index(period_id)
            if period_index < len(period_order) - 1:
                next_period_id = period_order[period_index + 1]
                current_period = period_schedule.get(period_id)
                next_period = period_schedule.get(next_period_id)
                if (
                    current_period
                    and next_period
                    and current_period['end_time'] == next_period['start_time']
                ):
                    midpoint = (current_period['center'] + next_period['center']) / 2
                    spacing = next_period['center'] - current_period['center']
                    if abs(token['cx'] - midpoint) <= min(90, spacing * 0.3):
                        duration = 2
                        is_lab = True
                        end_time = period_time_range(next_period_id, (end_time, end_time))[1]
                        covered_periods.add(next_period_id)

            # Check if lab by code name or legend
            if 'AIL' in code or 'lab' in legend_map.get(code, {}).get('name', '').lower() or code in ['24AIL308', '24AI307A', '24AIL506', '24AIL507']:
                is_lab = True
                duration = 2
                if period_id == 'p2':
                    end_time = p2_lab_end
                    covered_periods.add('p3')
                elif period_id == 'p4':
                    end_time = p4_lab_end
                    covered_periods.add('p5')

            # Subject lookup
            subj_obj = db_subjects_by_code.get(code)
            subj_name = ""
            if subj_obj:
                subj_name = clean_subject_name(subj_obj.name)
            elif code in legend_map:
                subj_name = clean_subject_name(legend_map[code]['name'])
            elif code in KNOWN_SPECIAL_SUBJECTS:
                subj_name = KNOWN_SPECIAL_SUBJECTS[code]['name']
            else:
                subj_name = code

            # Faculty lookup
            fac_initials = legend_map.get(code, {}).get('faculty_initials', [])
            fac_obj = resolve_faculty(fac_initials, default_sub_code=code)

            cell_payload = {
                'faculty_id': fac_obj.id if fac_obj else 1,
                'faculty_name': fac_obj.name if fac_obj else 'Department Staff',
                'subject_id': subj_obj.id if subj_obj else '',
                'subject_code': code,
                'subject_name': subj_name,
                'start_time': start_time,
                'end_time': end_time,
                'duration_hours': duration,
                'is_lab': is_lab,
                'room_number': detected_lab if is_lab else detected_classroom
            }

            grid_data[day_key][period_id] = cell_payload

            entries_list.append({
                'day_of_week': day_key,
                'start_time': start_time,
                'end_time': end_time,
                'faculty_id': cell_payload['faculty_id'],
                'faculty_name': cell_payload['faculty_name'],
                'subject_id': cell_payload['subject_id'],
                'subject_code': cell_payload['subject_code'],
                'subject_name': cell_payload['subject_name'],
                'room_number': cell_payload['room_number']
            })

    return {
        'success': True,
        'detected_semester_number': detected_sem_num or 3,
        'detected_classroom': detected_classroom,
        'detected_lab': detected_lab,
        'legend': list(legend_map.values()),
        'period_schedule': {
            period_id: {
                'start_time': period['start_time'],
                'end_time': period['end_time']
            }
            for period_id, period in period_schedule.items()
        },
        'grid': grid_data,
        'entries': entries_list,
        'total_extracted': len(entries_list)
    }
