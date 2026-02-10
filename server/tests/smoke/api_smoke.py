import requests
import json
import wave
import os

BASE_URL = "http://localhost:8000"
SESSION_ID = "smoke-test-session"
PERSONA_ID = "phainon"

def create_dummy_wav(filename="test_audio.wav"):
    with wave.open(filename, 'wb') as wav_file:
        # Set parameters: 1 channel, 2 bytes per sample, 16000 sample rate
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(16000)
        # Write some silence
        wav_file.writeframes(b'\x00' * 32000) # 1 second of silence
    return filename

def test_text_chat():
    print("Testing /v1/chat/text...")
    url = f"{BASE_URL}/v1/chat/text"
    payload = {
        "session_id": SESSION_ID,
        "persona_id": PERSONA_ID,
        "user_text": "Hello, this is a smoke test."
    }
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        print(f"Success! Response: {json.dumps(data, indent=2, ensure_ascii=False)}")
        return True
    except Exception as e:
        print(f"Failed: {e}")
        if 'response' in locals():
            print(f"Response text: {response.text}")
        return False

def test_voice_chat():
    print("\nTesting /v1/chat/voice...")
    url = f"{BASE_URL}/v1/chat/voice"
    wav_file = create_dummy_wav()
    
    try:
        with open(wav_file, 'rb') as f:
            files = {
                'audio': ('test.wav', f, 'audio/wav')
            }
            data = {
                'session_id': SESSION_ID,
                'persona_id': PERSONA_ID
            }
            response = requests.post(url, files=files, data=data)
            response.raise_for_status()
            result = response.json()
            print(f"Success! Response keys: {list(result.keys())}")
            return True
    except Exception as e:
        print(f"Failed: {e}")
        if 'response' in locals():
            print(f"Response text: {response.text}")
        return False
    finally:
        if os.path.exists(wav_file):
            os.remove(wav_file)

if __name__ == "__main__":
    print(f"Checking API at {BASE_URL}")
    text_ok = test_text_chat()
    # voice_ok = test_voice_chat() # 先注释掉，因为可能需要真实的音频处理后端支持，或者我们可以试一下
    voice_ok = True # 暂时跳过，如果 text 通了就说明核心通了。或者我可以试着跑一下。
    # 还是跑一下吧，反正失败了也不影响 text 的结果
    if text_ok:
        voice_ok = test_voice_chat()
    
    if text_ok and voice_ok:
        print("\nAll Smoke Tests Passed!")
        exit(0)
    else:
        print("\nSmoke Tests Failed!")
        exit(1)
