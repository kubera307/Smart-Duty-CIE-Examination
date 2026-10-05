import re
import os
import io
from PIL import Image
from models import db, Faculty, Semester, Subject

# Department Faculty & Extended Faculty Roster
INITIALS_TO_NAMES = {
    'ABC': 'Dr. Arjun B C',
    'HYS': 'Dr. Swathi H Y',
    'SMV': 'Mrs. Sushma M V',
    'ANS': 'Mrs. Ankitha S',
    'MHC': 'Mrs. Megha H C',
    'MB':  'Mrs. Maseeha Banu',
    'SDN': 'Sheethal D N',
    'AGN': 'Dr. Adithya G N',
    'SSG': 'Prof. S. S. Girish',
    'AKP': 'Prof. A. K. Parvathi'
}

INITIALS_ALIASES = {
    'LVB': 'MB',
    'IVB': 'MB',
    'KITHAS': 'ANS',
    'ANKITHA': 'ANS',
    'ARJUN': 'ABC'
}

KNOWN_SPECIAL_SUBJECTS = {
    '24NYP1': {'name': 'NSS, YOGA, PE', 'ltp': '0-0-2', 'credits': 'Audit', 'faculty': 'ANS'},
    '25NYP1': {'name': 'NSS, YOGA, PE', 'ltp': '0-0-2', 'credits': 'Audit', 'faculty': 'MB'},
    '24BCM':  {'name': 'Bridge Course Mathematics (MC for Diploma students)', 'ltp': '3-0-0', 'credits': 'Audit', 'faculty': 'AKP'},
    '25BCM301': {'name': 'Bridge Mathematics-I', 'ltp': '3-0-0', 'credits': 'Audit', 'faculty': 'AKP'},
    '24SCR':  {'name': 'Social Connect and Responsibility', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'MHC'},
    '25SCR':  {'name': 'Community Project / Societal Project', 'ltp': '0-0-2', 'credits': '1', 'faculty': 'MHC'}
}

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
    return code

def parse_timetable_from_image(image_file_or_bytes):
    """
    Parses an institutional timetable circular image into structured weekly timetable slots.
    Returns:
    {
      "detected_semester_number": int,
      "detected_classroom": str,
      "detected_lab": str,
      "legend": list of dicts,
      "grid": dict of days -> periods -> cell,
      "entries": list of ready-to-save timetable dicts
    }
    """
    try:
        import winocr
    except ImportError:
        winocr = None

    if isinstance(image_file_or_bytes, (bytes, bytearray)):
        img = Image.open(io.BytesIO(image_file_or_bytes))
    elif hasattr(image_file_or_bytes, 'read'):
        img = Image.open(image_file_or_bytes)
    elif isinstance(image_file_or_bytes, str) and os.path.exists(image_file_or_bytes):
        img = Image.open(image_file_or_bytes)
    else:
        raise ValueError("Invalid image input provided to parse_timetable_from_image")

    # Run OCR
    words = []
    lines_text = []
    if winocr:
        ocr_res = winocr.recognize_pil_sync(img)
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

    # 1. Detect Semester Number
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

    # 2. Detect Classroom & Lab
    cr_match = re.search(r'Classroom\s*:\s*([A-Z0-9]+)', full_text, re.I)
    detected_classroom = cr_match.group(1).replace('J', 'I').replace('O', '0') if cr_match else ('AI302' if detected_sem_num == 3 else 'AI301')

    detected_lab = 'SA-205 / MB-202' if ('SA-205' in full_text or 'MB-202' in full_text) else 'SA-205'

    # 3. Detect Legend Table (Subject code -> Subject name -> Faculty Initials)
    legend_words = [w for w in words if w['y'] >= 1550 and w['y'] < 3000]
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

    legend_map = {} # code -> { name, faculty_initials, ltp, credits }
    code_regex = re.compile(r'^(2[3-6][A-Z0-9]+)$', re.I)

    for r in legend_rows:
        r.sort(key=lambda w: w['x'])
        first_word = r[0]['text'].strip().upper()
        norm_first = normalize_subject_code(first_word)
        if code_regex.match(norm_first):
            fac_words = [w['text'].replace(',', '').strip().upper() for w in r if w['x'] >= 2050]
            ltp_words = [w['text'] for w in r if 1700 <= w['x'] < 1850]
            credit_words = [w['text'] for w in r if 1850 <= w['x'] < 2050]
            name_words = [w['text'] for w in r if 650 <= w['x'] < 1700]

            name = " ".join(name_words)
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

    # Inject known special subjects if not parsed cleanly from legend
    for k_code, k_info in KNOWN_SPECIAL_SUBJECTS.items():
        if k_code not in legend_map:
            legend_map[k_code] = {
                'code': k_code,
                'name': k_info['name'],
                'ltp': k_info['ltp'],
                'credits': k_info['credits'],
                'faculty_initials': [k_info['faculty']]
            }

    # 4. Detect Day Rows
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
        if clean in days_map:
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

    # Pre-fetch database faculty for matching
    all_faculty = Faculty.query.all()
    faculty_by_id = {f.id: f for f in all_faculty}

    def resolve_faculty(initials_list, default_sub_code=""):
        # Match initials to DB faculty
        for init in initials_list:
            full_name = INITIALS_TO_NAMES.get(init)
            if full_name:
                for f in all_faculty:
                    if f.name.lower().strip() == full_name.lower().strip():
                        return f
            for f in all_faculty:
                if f.login_id and f.login_id.lower() == init.lower():
                    return f

        # Subject code heuristic matching for CSE (AI & ML) core staff
        sub_upper = default_sub_code.upper()
        if '304' in sub_upper or '308' in sub_upper:
            # Maseeha Banu
            return next((f for f in all_faculty if 'maseeha' in f.name.lower()), all_faculty[0])
        elif '302' in sub_upper:
            # Swathi H Y
            return next((f for f in all_faculty if 'swathi' in f.name.lower()), all_faculty[0])
        elif '303' in sub_upper:
            # Sheethal D N
            return next((f for f in all_faculty if 'sheethal' in f.name.lower()), all_faculty[0])
        elif '305' in sub_upper:
            # Dr. Arjun B C
            return next((f for f in all_faculty if 'arjun' in f.name.lower()), all_faculty[0])
        elif '306' in sub_upper:
            # Swathi H Y / Sheethal D N
            return next((f for f in all_faculty if 'swathi' in f.name.lower() or 'sheethal' in f.name.lower()), all_faculty[0])
        elif '307' in sub_upper:
            # Ankitha S
            return next((f for f in all_faculty if 'ankitha' in f.name.lower()), all_faculty[0])
        elif 'SCR' in sub_upper:
            # Megha H C
            return next((f for f in all_faculty if 'megha' in f.name.lower()), all_faculty[0])
        elif 'MAAI' in sub_upper or 'BCM' in sub_upper:
            # Math faculty or coordinator
            return next((f for f in all_faculty if 'ankitha' in f.name.lower() or 'swathi' in f.name.lower()), all_faculty[0])

        return all_faculty[0] if all_faculty else None

    # Pre-fetch subjects for the detected semester
    semester_record = None
    if detected_sem_num:
        semester_record = Semester.query.filter_by(sem_number=detected_sem_num).first()
    db_subjects = Subject.query.filter_by(semester_id=semester_record.id).all() if semester_record else Subject.query.all()
    db_subjects_by_code = {s.code.upper(): s for s in db_subjects}

    # Grid mapping
    grid_data = {
        'MON': {}, 'TUE': {}, 'WED': {}, 'THU': {}, 'FRI': {}, 'SAT': {}
    }
    entries_list = []

    for i, d in enumerate(unique_days):
        day_key = d['day']
        y_start = d['y'] - 30
        y_end = unique_days[i+1]['y'] - 30 if i + 1 < len(unique_days) else d['y'] + 80

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

        # Map tokens to periods based on x coordinates:
        # P1: 650 - 950 (09:30-10:30)
        # P2: 1000 - 1220 (11:00-12:00)
        # P2-P3 Lab: 1220 - 1320 (11:00-13:00) -> Placed at P2 (2 hrs)
        # P3: 1320 - 1600 (12:00-13:00)
        # P4: 1700 - 1880 (14:00-15:00)
        # P4-P5 Lab: 1880 - 1980 (14:00-16:00) -> Placed at P4 (2 hrs)
        # P5: 1980 - 2180 (15:00-16:00)
        # P6: 2180 - 2450 (16:00-17:00)

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

            if 650 <= x <= 950:
                period_id = 'p1'
                start_time = '09:30'
                end_time = '10:30'
            elif 1220 <= x <= 1320:
                # 2-hour lab spanning P2 and P3 (11:00 - 13:00)
                period_id = 'p2'
                is_lab = True
                duration = 2
                start_time = '11:00'
                end_time = '13:00'
                covered_periods.add('p3')
            elif 1000 <= x < 1220:
                period_id = 'p2'
                start_time = '11:00'
                end_time = '12:00'
            elif 1320 < x <= 1600:
                if 'p3' not in covered_periods:
                    period_id = 'p3'
                    start_time = '12:00'
                    end_time = '13:00'
            elif 1860 <= x <= 1980:
                # 2-hour lab / practical spanning P4 and P5 (14:00 - 16:00)
                period_id = 'p4'
                is_lab = True
                duration = 2
                start_time = '14:00'
                end_time = '16:00'
                covered_periods.add('p5')
            elif 1700 <= x < 1860:
                period_id = 'p4'
                start_time = '14:00'
                end_time = '15:00'
            elif 1980 < x <= 2180:
                if 'p5' not in covered_periods:
                    period_id = 'p5'
                    start_time = '15:00'
                    end_time = '16:00'
            elif 2180 < x <= 2450:
                period_id = 'p6'
                start_time = '16:00'
                end_time = '17:00'

            if not period_id:
                continue

            # Check if lab by code name or legend
            if 'AIL' in code or 'lab' in legend_map.get(code, {}).get('name', '').lower():
                is_lab = True
                duration = 2
                if period_id == 'p2':
                    end_time = '13:00'
                    covered_periods.add('p3')
                elif period_id == 'p4':
                    end_time = '16:00'
                    covered_periods.add('p5')

            # Subject lookup
            subj_obj = db_subjects_by_code.get(code)
            subj_name = ""
            if subj_obj:
                subj_name = subj_obj.name
            elif code in legend_map:
                subj_name = legend_map[code]['name']
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
        'grid': grid_data,
        'entries': entries_list,
        'total_extracted': len(entries_list)
    }

