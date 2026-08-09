def render_html(svg_content: str, annual_data: dict, representativity: str) -> str:
    """
    Renders an HTML preview page wrapping the SVG and key indicators.
    """
    warmest = annual_data.get('warmest_month', {})
    coldest = annual_data.get('coldest_month', {})
    wettest = annual_data.get('wettest_month', {})
    driest = annual_data.get('driest_month', {})

    html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Preview - Le climat de la zone</title>
    <style>
        body {{
            font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            background-color: #FBFAF7;
            color: #24313A;
            margin: 0;
            padding: 2rem;
            display: flex;
            flex-direction: column;
            align-items: center;
        }}
        .container {{
            max-width: 1280px;
            width: 100%;
        }}
        .graph-container {{
            background-color: #C5C4C1;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(28, 37, 41, 0.1);
            margin-bottom: 2rem;
        }}
        .indicators {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1rem;
            margin-bottom: 2rem;
        }}
        .indicator-card {{
            background-color: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(28, 37, 41, 0.05);
        }}
        .indicator-card h3 {{
            margin-top: 0;
            font-size: 0.9rem;
            color: #52616A;
            text-transform: uppercase;
        }}
        .indicator-card p {{
            margin: 0;
            font-size: 1.5rem;
            font-weight: bold;
        }}
        .indicator-card .sub {{
            font-size: 0.9rem;
            color: #52616A;
            font-weight: normal;
        }}
        .explanatory {{
            background-color: white;
            padding: 1.5rem;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(28, 37, 41, 0.05);
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="graph-container">
            {svg_content}
        </div>
        
        <div class="indicators">
            <div class="indicator-card">
                <h3>Température moyenne annuelle</h3>
                <p>{annual_data.get('mean_temperature_c', '-')} °C</p>
            </div>
            <div class="indicator-card">
                <h3>Précipitations annuelles</h3>
                <p>{annual_data.get('precipitation_mm', '-')} mm</p>
            </div>
            <div class="indicator-card">
                <h3>Mois le plus chaud</h3>
                <p>{warmest.get('name', '-')} <span class="sub">· {warmest.get('value', '-')} °C</span></p>
            </div>
            <div class="indicator-card">
                <h3>Mois le plus froid</h3>
                <p>{coldest.get('name', '-')} <span class="sub">· {coldest.get('value', '-')} °C</span></p>
            </div>
            <div class="indicator-card">
                <h3>Mois le plus humide</h3>
                <p>{wettest.get('name', '-')} <span class="sub">· {wettest.get('value', '-')} mm</span></p>
            </div>
            <div class="indicator-card">
                <h3>Mois le plus sec</h3>
                <p>{driest.get('name', '-')} <span class="sub">· {driest.get('value', '-')} mm</span></p>
            </div>
        </div>
        
        <div class="indicators">
            <div class="indicator-card">
                <h3>Jours de gel</h3>
                <p>{annual_data.get('frost_days_mean', '-')} <span class="sub">jours/an</span></p>
            </div>
            <div class="indicator-card">
                <h3>Jours ≥ 30 °C</h3>
                <p>{annual_data.get('hot_days_30c_mean', '-')} <span class="sub">jours/an</span></p>
            </div>
            <div class="indicator-card">
                <h3>Nuits ≥ 20 °C</h3>
                <p>{annual_data.get('tropical_nights_20c_mean', '-')} <span class="sub">nuits/an</span></p>
            </div>
        </div>
        
        <div class="explanatory">
            <h2>Comment lire</h2>
            <p>La courbe rouge montre la température moyenne au fil de l’année ; son halo représente la variabilité habituelle entre 1991 et 2020. Les barres bleues montrent les précipitations mensuelles moyennes. Les valeurs décrivent le contexte climatique de la zone à partir de données de réanalyse sur grille.</p>
            
            <h2>Représentativité</h2>
            <p>{representativity}</p>
            
            <h2>Sources</h2>
            <p>Température / précipitations : ERA5-Land<br>Référence climatologique : 1991–2020<br>Méthode spatiale : moyenne pondérée par surface</p>
        </div>
    </div>
</body>
</html>"""
    return html
