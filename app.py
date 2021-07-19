import os
import flask
import requests
import time
import math
import random
from random import gauss
from flask import render_template

import google.oauth2.credentials
import google_auth_oauthlib.flow
import googleapiclient.discovery
from googleapiclient.discovery import build


# This variable specifies the name of a file that contains the OAuth 2.0
# information for this application, including its client_id and client_secret.
CLIENT_SECRETS_FILE = "client_secrets.json"

# This OAuth 2.0 access scope allows for full read/write access to the
# authenticated user's account and requires requests to use an SSL connection.
SCOPES = ["https://www.googleapis.com/auth/fitness.activity.read",
        "https://www.googleapis.com/auth/fitness.location.read"]

API_SERVICE_NAME = 'fitness'
API_VERSION = 'v1'

app = flask.Flask(__name__)

# Note: A secret key is included in the sample so that it works.
# If you use this code in your application, replace this with a truly secret
# key. See https://flask.palletsprojects.com/quickstart/#sessions.
app.secret_key = 'REPLACE ME - this value is here as a placeholder.'


@app.route('/')
def index(): 
    return print_index_table()

@app.route('/index')
def ind():
    return render_template('/index.html')

@app.route('/test')
def test_api_request():
    if 'credentials' not in flask.session:
        return flask.redirect('authorize')

    # Load credentials from the session.
    credentials = google.oauth2.credentials.Credentials(
        **flask.session['credentials'])

    def current_milli_time():
        return round(time.time() * 1000)

    monthPast = 4
    now = current_milli_time()
    day = 86400000
    month = 31*day
    lastTime = now-monthPast*month

    heartPointsList=[]

    with build(API_SERVICE_NAME, API_VERSION,credentials = credentials) as fit:  
        for timeU in range(lastTime,now,2*month):
            body = {
                "aggregateBy": [{
                    "dataSourceId": "derived:com.google.heart_minutes:com.google.android.gms:merge_heart_minutes",
                    "dataTypeName": "com.google.heart_minutes"
                    },],
                "bucketByTime": { "durationMillis": 86400000 },
                "startTimeMillis": (timeU-2*month), 
                "endTimeMillis": timeU
            }

            request = fit.users().dataset().aggregate(userId="me",body=body)
            
            try:
                response = request.execute()
            except HttpError as e:
                print('Error response status code : {0}, reason : {1}'.format(e.status_code, e.error_details))

            response = request.execute()

            bucket = response['bucket']
            
            for day in bucket:
                data = day['dataset']
                for d in data:
                    point = d['point']
                    for p in point:
                        value = p['value']
                        for val in value:
                            if 'fpVal' in val:
                                heart = val['fpVal']
                                heartPointsList.append(heart)

    listToCord(heartPointsList,monthPast)


    # Save credentials back to session in case access token was refreshed.
    # ACTION ITEM: In a production app, you likely want to save these
    #              credentials in a persistent database instead.
    flask.session['credentials'] = credentials_to_dict(credentials)

    return flask.jsonify(**response)


@app.route('/authorize')
def authorize():
    # Create flow instance to manage the OAuth 2.0 Authorization Grant Flow steps.
    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES)

    # The URI created here must exactly match one of the authorized redirect URIs
    # for the OAuth 2.0 client, which you configured in the API Console. If this
    # value doesn't match an authorized URI, you will get a 'redirect_uri_mismatch'
    # error.
    flow.redirect_uri = flask.url_for('oauth2callback', _external=True)

    authorization_url, state = flow.authorization_url(
        # Enable offline access so that you can refresh an access token without
        # re-prompting the user for permission. Recommended for web server apps.
        access_type='offline',
        # Enable incremental authorization. Recommended as a best practice.
        include_granted_scopes='true')

    # Store the state so the callback can verify the auth server response.
    flask.session['state'] = state

    return flask.redirect(authorization_url)


@app.route('/oauth2callback')
def oauth2callback():
    # Specify the state when creating the flow in the callback so that it can
    # verified in the authorization server response.
    state = flask.session['state']

    flow = google_auth_oauthlib.flow.Flow.from_client_secrets_file(
        CLIENT_SECRETS_FILE, scopes=SCOPES, state=state)
    flow.redirect_uri = flask.url_for('oauth2callback', _external=True)

    # Use the authorization server's response to fetch the OAuth 2.0 tokens.
    authorization_response = flask.request.url
    flow.fetch_token(authorization_response=authorization_response)

    # Store credentials in the session.
    # ACTION ITEM: In a production app, you likely want to save these
    #              credentials in a persistent database instead.
    credentials = flow.credentials
    flask.session['credentials'] = credentials_to_dict(credentials)

    return flask.redirect(flask.url_for('test_api_request'))


@app.route('/revoke')
def revoke():
    if 'credentials' not in flask.session:
        return ('You need to <a href="/authorize">authorize</a> before ' +
                'testing the code to revoke credentials.')

    credentials = google.oauth2.credentials.Credentials(
        **flask.session['credentials'])

    revoke = requests.post('https://oauth2.googleapis.com/revoke',
        params={'token': credentials.token},
        headers = {'content-type': 'application/x-www-form-urlencoded'})

    status_code = getattr(revoke, 'status_code')
    if status_code == 200:
        return('Credentials successfully revoked.' + print_index_table())
    else:
        return('An error occurred.' + print_index_table())


@app.route('/clear')
def clear_credentials():
    if 'credentials' in flask.session:
        del flask.session['credentials']
    return ('Credentials have been cleared.<br><br>' +
            print_index_table())


def credentials_to_dict(credentials):
    return {'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes}

def print_index_table():
    return ('<table>' +
            '<tr><td><a href="/test">Test an API request</a></td>' +
            '<td>Submit an API request and see a formatted JSON response. ' +
            '    Go through the authorization flow if there are no stored ' +
            '    credentials for the user.</td></tr>' +
            '<tr><td><a href="/authorize">Test the auth flow directly</a></td>' +
            '<td>Go directly to the authorization flow. If there are stored ' +
            '    credentials, you still might not be prompted to reauthorize ' +
            '    the application.</td></tr>' +
            '<tr><td><a href="/revoke">Revoke current credentials</a></td>' +
            '<td>Revoke the access token associated with the current user ' +
            '    session. After revoking credentials, if you go to the test ' +
            '    page, you should see an <code>invalid_grant</code> error.' +
            '</td></tr>' +
            '<tr><td><a href="/clear">Clear Flask session credentials</a></td>' +
            '<td>Clear the access token currently stored in the user session. ' +
            '    After clearing the token, if you <a href="/test">test the ' +
            '    API request</a> again, you should go back to the auth flow.' +
            '</td></tr></table>')


def listToCord(lst,monthPast):
    threshold = 60
    bottomX = 1536/2
    bottomY = 800
    angle = float(-math.pi/10)
    delta = float(math.pi/5)
    radius = 0
    coords = []

    for i in range(15):
        x = bottomX
        bottomY-=20
        y = bottomY
        coords.append([x,y])
    

    for i in range(7*10):
        if(i%7==0):
            angle = float(-math.pi/10) 
            if(i<7*5):
                radius +=5
            else:
                radius+=15

        x = bottomX + radius*math.cos(angle) 
        y = bottomY - 1.2*(radius*math.sin(angle))
        coords.append([x,y])
        angle += delta
    
    for idx, input in enumerate(lst):
        if(idx%7==0):
            radius+=(15-float(monthPast/4))
            angle = float(-math.pi/10) 
        if input>threshold:
            randSign = 1 if random.random() < 0.5 else -1
            for i in range(40,input,10):
                randR = gauss(i/2,2)
                # randY = gauss(0,2)
                x = bottomX + radius*math.cos(angle) + randR*math.cos(angle+ randSign*math.pi/2)
                y = bottomY - 1.2*(radius*math.sin(angle) + randR*math.sin(angle+randSign*math.pi/2))
                coords.append([x,y])
        
        
        x = bottomX + radius*math.cos(angle) + gauss(0,4)
        y = bottomY - 1.2*radius*math.sin(angle) 
        coords.append([x,y])
        
        angle += delta

        # print(coords)
    
    save_path = "/mnt/c/Users/Asaf's PC/Desktop/תכנות/spaceCol/2d-space-colonization-experiments/experiments/from-images/js"
    fileName = os.path.join(save_path, 'AttractorPatterns.js')         

    with open(fileName,'w') as f:
        f.write('export let GreekStatue = [\n')
        for item in coords:
            f.write("%s,\n" %item)
        f.write(']')


if __name__ == '__main__':
    # When running locally, disable OAuthlib's HTTPs verification.
    # ACTION ITEM for developers:
    #     When running in production *do not* leave this option enabled.
    os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

    # Specify a hostname and port that are set as a valid redirect URI
    # for your API project in the Google API Console.
    app.run('localhost', 8080, debug=True)