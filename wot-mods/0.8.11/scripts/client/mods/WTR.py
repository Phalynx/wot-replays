# original file: res/scripts/client/account_helpers/battleresultscache.pyc
from account_helpers import BattleResultsCache
import cPickle
import base64
from debug_utils import *
from threading import Thread
from urlparse import urlparse
import httplib
import traceback
import json

# these are the original methods
std_save = BattleResultsCache.save

def __new_save(accountName, battleResults):
    print "Replacement WTR.save called\n"
    std_save(accountName, battleResults)

    try:
        print "- arena_id: " + str(battleResults[0]) + "\n"

        s_obj = (battleResults, BattleResultsCache.convertToFullForm(battleResults))
        j_obj = {
            "arena_id" : str(battleResults[0]),
            "battleResult": base64.b64encode(cPickle.dumps(BattleResultsCache.convertToFullForm(battleResults), 2))
        }
            
        jsonString = json.dumps(j_obj)

        print "- submit: " + jsonString + "\n"

        submitter = BattleResultsSubmitter(jsonString)
        thread = Thread(target=submitter.submit);
        thread.start()
    except Exception as e:
        traceback.format_exc()
        LOG_CURRENT_EXCEPTION()


class BattleResultsSubmitter(object):
    def __init__(self, jsonString):
        self.jsonString = jsonString
    
    def submit(self): 
        u = urlparse('http://api.wotreplays.org/util/battleresult/submit')
        print('[BattleResultsSubmitter.submit] to ' + repr(u))
        try:
            conn = httplib.HTTPConnection(u.netloc, timeout=5)
            conn.request('POST', u.path, self.jsonString, { "Content-Type": "application/json" })
            response = conn.getresponse()
            print(response.status, response.reason)
            print(response.read())
        except Exception as e:
            traceback.format_exc()
            LOG_CURRENT_EXCEPTION()


BattleResultsCache.save = __new_save
