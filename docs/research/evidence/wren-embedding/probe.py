# Checks: binary imports, MDL mapping/calculation, cube aggregation/filtering,
# rejected unknown metric/model, and JSON transport. All data is synthetic.
import base64
import json
import tempfile
import time
from pathlib import Path

started = time.perf_counter()
import duckdb
from wren.engine import WrenEngine
from wren.config import WrenConfig
from wren_core import cube_query_to_sql
imports_ms = round((time.perf_counter() - started) * 1000)

request = json.loads(__import__('sys').stdin.read())
with tempfile.TemporaryDirectory(prefix='wren-synthetic-') as data_dir:
    db = duckdb.connect(str(Path(data_dir) / 'sample.duckdb'))
    db.execute('CREATE TABLE raw_orders(id INTEGER, region VARCHAR, gross DECIMAL(12, 2), refund DECIMAL(12, 2), status VARCHAR)')
    db.executemany('INSERT INTO raw_orders VALUES (?, ?, ?, ?, ?)', [
        (1, '华东', 100, 10, 'paid'), (2, '华东', 50, 0, 'paid'),
        (3, '华南', 80, 20, 'paid'), (4, '华东', 1000, 0, 'cancelled')])
    db.close()
    mdl = {
        'catalog': 'wren', 'schema': 'public',
        'models': [{
            'name': 'Orders', 'primaryKey': 'id',
            'tableReference': {'catalog': 'sample', 'schema': 'main', 'table': 'raw_orders'},
            'columns': [
                {'name': 'id', 'type': 'INTEGER'}, {'name': 'region', 'type': 'VARCHAR'},
                {'name': 'gross', 'type': 'decimal'}, {'name': 'refund', 'type': 'decimal'},
                {'name': 'status', 'type': 'VARCHAR'},
                {'name': 'net_amount', 'type': 'decimal', 'isCalculated': True, 'expression': 'gross - refund'}
            ]}],
        'relationships': [], 'views': [],
        'cubes': [{'name': 'sales', 'baseObject': 'Orders',
                   'measures': [{'name': 'net_revenue', 'expression': 'SUM(net_amount)', 'type': 'decimal'}],
                   'dimensions': [{'name': 'region', 'expression': 'region', 'type': 'VARCHAR'},
                                  {'name': 'status', 'expression': 'status', 'type': 'VARCHAR'}],
                   'timeDimensions': []}]
    }
    manifest_json = json.dumps(mdl)
    engine = WrenEngine(
        manifest_str=base64.b64encode(manifest_json.encode()).decode(),
        data_source='duckdb', connection_info={'url': data_dir, 'format': 'duckdb'},
        config=WrenConfig(strict_mode=True), fallback=False)
    try:
        sql = cube_query_to_sql(json.dumps(request), manifest_json)
        t = time.perf_counter()
        planned = engine.dry_plan(sql)
        rows = engine.query(sql, limit=20).to_pylist()
        query_ms = round((time.perf_counter() - t) * 1000)
        actual = {r['region']: float(r['net_revenue']) for r in rows}
        assert actual == {'华东': 140.0, '华南': 60.0}, actual
        followup = {**request, 'filters': request['filters'] + [{'dimension': 'region', 'operator': 'eq', 'value': '华东'}]}
        followup_rows = engine.query(cube_query_to_sql(json.dumps(followup), manifest_json), limit=20).to_pylist()
        assert len(followup_rows) == 1 and float(followup_rows[0]['net_revenue']) == 140
        try:
            cube_query_to_sql(json.dumps({**request, 'measures': ['not_registered']}), manifest_json)
        except ValueError:
            unknown_metric_rejected = True
        else:
            raise AssertionError('unknown metric was accepted')
        try:
            engine.query('SELECT * FROM raw_orders', limit=10)
        except Exception as error:
            unknown_model_error = str(error)
            assert 'raw_orders' in unknown_model_error
        else:
            raise AssertionError('non-MDL table was accepted')
        print(json.dumps({'ok': True, 'imports_ms': imports_ms, 'query_ms': query_ms,
            'rows': rows, 'followup': followup_rows, 'cube_sql': sql, 'duckdb_sql': planned,
            'unknown_metric_rejected': unknown_metric_rejected, 'unknown_model_error': unknown_model_error},
            ensure_ascii=False, default=str))
    finally:
        engine.close()
