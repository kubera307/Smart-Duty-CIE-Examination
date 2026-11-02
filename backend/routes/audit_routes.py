from flask import Blueprint, request, jsonify
from models import db, AuditLog, SystemSettings

audit_bp = Blueprint('audit_bp', __name__)

@audit_bp.route('/logs', methods=['GET'])
def get_audit_logs():
    """Returns paginated audit trail logs."""
    limit = int(request.args.get('limit', 50))
    action = request.args.get('action')

    query = AuditLog.query
    if action:
        query = query.filter_by(action=action)

    logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
    return jsonify([l.to_dict() for l in logs])


@audit_bp.route('/settings', methods=['GET'])
def get_settings():
    settings = SystemSettings.query.all()
    settings_data = {s.key: s.to_dict() for s in settings}
    for key, value, description in (
        ('duty_spacing_sessions', '1', 'Minimum examination sessions between duties for the same faculty'),
        ('duty_spacing_days', '1', 'Minimum full calendar days between examination duties')
    ):
        if key not in settings_data:
            settings_data[key] = {
                'key': key,
                'value': value,
                'description': description
            }
    return jsonify(settings_data)


@audit_bp.route('/settings', methods=['PUT'])
def update_settings():
    data = request.get_json() or {}
    updated = []
    for k, v in data.items():
        setting = SystemSettings.query.filter_by(key=k).first()
        if k in ('duty_spacing_sessions', 'duty_spacing_days'):
            try:
                parsed_value = int(v)
            except (TypeError, ValueError):
                return jsonify({'error': f'{k} must be an integer'}), 400
            if not 0 <= parsed_value <= 7:
                return jsonify({'error': f'{k} must be between 0 and 7'}), 400
            if not setting:
                descriptions = {
                    'duty_spacing_sessions': 'Minimum examination sessions between duties for the same faculty',
                    'duty_spacing_days': 'Minimum full calendar days between examination duties'
                }
                setting = SystemSettings(
                    key=k,
                    value=str(parsed_value),
                    description=descriptions[k]
                )
                db.session.add(setting)
            else:
                setting.value = str(parsed_value)
            updated.append(k)
            audit = AuditLog(
                action='SETTINGS_UPDATED',
                user_identifier=request.headers.get('X-User', 'Admin'),
                entity_type='SystemSettings',
                entity_id=setting.id,
                new_value=f"{k}: {setting.value}",
                details=f"System setting '{k}' updated to '{setting.value}'."
            )
            db.session.add(audit)
            continue
        if setting:
            old_v = setting.value
            setting.value = str(v)
            updated.append(k)

            audit = AuditLog(
                action='SETTINGS_UPDATED',
                user_identifier=request.headers.get('X-User', 'Admin'),
                entity_type='SystemSettings',
                entity_id=setting.id,
                old_value=f"{k}: {old_v}",
                new_value=f"{k}: {setting.value}",
                details=f"System setting '{k}' updated to '{setting.value}'."
            )
            db.session.add(audit)

    db.session.commit()
    return jsonify({'success': True, 'updated_keys': updated})
