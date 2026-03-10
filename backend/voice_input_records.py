"""
Python Audio + File Processing Backend
Handles: 
  - Audio → Whisper Transcription → Node.js Groq API → Response
  - File Upload (Images/PDFs) → OCR → Extract Amount/Category → Response

Flow:
1. Frontend uploads audio/file to Python (Port 5000)
2. Python processes (Whisper for audio, OCR for images/PDFs)
3. Python calls Node.js /api/categorize (Port 3000)
4. Python returns result to Frontend
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import os
import json
import requests
from datetime import datetime
from pathlib import Path
import tempfile
import re

# Audio/ML libraries
try:
    from pydub import AudioSegment
    PYDUB_AVAILABLE = True
except ImportError:
    print("⚠️ pydub not installed. Audio conversion may be limited.")
    PYDUB_AVAILABLE = False

try:
    import speech_recognition as sr
    SR_AVAILABLE = True
except ImportError:
    print("⚠️ speech_recognition not installed. Using Groq API only.")
    SR_AVAILABLE = False

# OCR libraries
try:
    from PIL import Image
    PIL_AVAILABLE = True
except ImportError:
    print("⚠️ PIL not installed. Image processing unavailable.")
    PIL_AVAILABLE = False

try:
    import pytesseract
    TESSERACT_AVAILABLE = True
except ImportError:
    print("⚠️ pytesseract not installed. OCR unavailable.")
    TESSERACT_AVAILABLE = False

try:
    import easyocr
    EASYOCR_AVAILABLE = True
    # Initialize EasyOCR reader (supports English and Hindi)
    ocr_reader = easyocr.Reader('en', gpu=False)
except ImportError:
    print("⚠️ easyocr not installed. Falling back to Tesseract.")
    EASYOCR_AVAILABLE = False
    ocr_reader = None

try:
    import PyPDF2
    import pdf2image
    PDF_AVAILABLE = True
except ImportError:
    print("⚠️ PDF libraries not installed. PDF processing unavailable.")
    PDF_AVAILABLE = False


# Configuration
class Config:
    HOST = "0.0.0.0"
    PORT = 5000
    DEBUG = True
    
    # Node.js Backend URL (Dynamic for Railway)
    NODE_BACKEND_URL = os.getenv("NODE_BACKEND_URL", "http://localhost:3000")

    
    # Groq API (for Whisper transcription)
    GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
    
    # Audio settings
    AUDIO_TEMP_DIR = "./python_audio_temp"
    
    # File upload settings
    UPLOAD_TEMP_DIR = "./python_uploads_temp"
    MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
    ALLOWED_AUDIO_EXTENSIONS = {'webm', 'wav', 'mp3', 'ogg', 'm4a'}
    ALLOWED_IMAGE_EXTENSIONS = {'jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff'}
    ALLOWED_PDF_EXTENSIONS = {'pdf'}


# Flask App Setup
app = Flask(__name__)
CORS(app)

# Create temp directories
os.makedirs(Config.AUDIO_TEMP_DIR, exist_ok=True)
os.makedirs(Config.UPLOAD_TEMP_DIR, exist_ok=True)


# ============================================
# GROQ WHISPER API CLIENT
# ============================================

class GroqWhisperClient:
    """Client for Groq Whisper API"""
    
    def __init__(self, api_key):
        self.api_key = api_key
        self.endpoint = "https://api.groq.com/openai/v1/audio/transcriptions"
        self.model = "whisper-large-v3"
    
    def transcribe(self, audio_file_path, language="hi"):
        """Transcribe audio using Groq Whisper API"""
        if not self.api_key:
            raise Exception("Groq API key not configured")
        
        try:
            print(f"🎙️ Transcribing audio with Groq Whisper...")
            
            with open(audio_file_path, 'rb') as audio_file:
                files = {
                    'file': (os.path.basename(audio_file_path), audio_file, 'audio/wav'),
                }
                data = {
                    'model': self.model,
                    'language': language,
                    'response_format': 'json'
                }
                headers = {
                    'Authorization': f'Bearer {self.api_key}'
                }
                
                response = requests.post(
                    self.endpoint,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=30
                )
                
                if response.status_code == 200:
                    result = response.json()
                    transcript = result.get('text', '').strip()
                    print(f"✅ Transcription: \"{transcript}\"")
                    return transcript
                else:
                    print(f"❌ Groq API Error: {response.status_code}")
                    print(f"Response: {response.text}")
                    raise Exception(f"Groq API error: {response.status_code}")
                    
        except Exception as e:
            print(f"❌ Transcription error: {e}")
            raise


# ============================================
# OCR PROCESSOR
# ============================================

class OCRProcessor:
    """Handles OCR for images and PDFs"""
    
    def __init__(self):
        self.use_easyocr = EASYOCR_AVAILABLE
        self.use_tesseract = TESSERACT_AVAILABLE
    
    def extract_text_from_image(self, image_path):
        """
        Extract text from image using OCR
        
        Args:
            image_path: Path to image file
        
        Returns:
            str: Extracted text
        """
        try:
            print(f"🔍 Performing OCR on image...")
            
            # Try EasyOCR first (better for receipts)
            if self.use_easyocr and ocr_reader:
                print("📖 Using EasyOCR...")
                results = ocr_reader.readtext(image_path)
                text = '\n'.join([result[1] for result in results])
                print(f"✅ EasyOCR extracted: {len(text)} characters")
                return text
            
            # Fallback to Tesseract
            elif self.use_tesseract and PIL_AVAILABLE:
                print("📖 Using Tesseract OCR...")
                image = Image.open(image_path)
                text = pytesseract.image_to_string(image)
                print(f"✅ Tesseract extracted: {len(text)} characters")
                return text
            
            else:
                raise Exception("No OCR engine available")
                
        except Exception as e:
            print(f"❌ OCR error: {e}")
            raise
    
    def extract_text_from_pdf(self, pdf_path):
        """
        Extract text from PDF
        
        Args:
            pdf_path: Path to PDF file
        
        Returns:
            str: Extracted text
        """
        try:
            print(f"📄 Processing PDF...")
            
            if not PDF_AVAILABLE:
                raise Exception("PDF processing libraries not installed")
            
            # Try text extraction first
            with open(pdf_path, 'rb') as file:
                pdf_reader = PyPDF2.PdfReader(file)
                text = ""
                
                for page_num in range(len(pdf_reader.pages)):
                    page = pdf_reader.pages[page_num]
                    text += page.extract_text() + "\n"
                
                if text.strip():
                    print(f"✅ Extracted text from PDF: {len(text)} characters")
                    return text
            
            # If no text, convert to images and OCR
            print("📸 Converting PDF to images for OCR...")
            images = pdf2image.convert_from_path(pdf_path)
            
            text = ""
            for i, image in enumerate(images):
                temp_img_path = os.path.join(Config.UPLOAD_TEMP_DIR, f"pdf_page_{i}.png")
                image.save(temp_img_path, 'PNG')
                
                page_text = self.extract_text_from_image(temp_img_path)
                text += page_text + "\n"
                
                os.unlink(temp_img_path)
            
            print(f"✅ Extracted from PDF via OCR: {len(text)} characters")
            return text
            
        except Exception as e:
            print(f"❌ PDF processing error: {e}")
            raise
    
    def parse_receipt(self, text):
        """
        Parse receipt text to extract amount, items, merchant info
        
        Args:
            text: OCR extracted text
        
        Returns:
            dict: Parsed information
        """
        try:
            print(f"🧾 Parsing receipt...")
            
            # Extract amounts (₹, Rs, numbers)
            amounts = []
            amount_patterns = [
                r'(?:total|amount|grand\s*total|bill\s*amount)[:\s]*[₹Rs\.?\s]*(\d+(?:,\d{3})*(?:\.\d{2})?)',
                r'[₹Rs\.?\s]+(\d+(?:,\d{3})*(?:\.\d{2})?)',
                r'(\d+(?:,\d{3})*(?:\.\d{2})?)\s*(?:₹|Rs\.?)',
            ]
            
            for pattern in amount_patterns:
                matches = re.findall(pattern, text, re.IGNORECASE)
                for match in matches:
                    amount = float(match.replace(',', ''))
                    if 10 <= amount <= 100000:  # Reasonable range
                        amounts.append(amount)
            
            # Get the highest amount (usually the total)
            total_amount = max(amounts) if amounts else None
            
            # Extract merchant/vendor name (usually at top)
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            merchant = lines[0] if lines else None
            
            # Extract items (basic pattern matching)
            items = []
            item_pattern = r'([A-Za-z\s]+)\s+[₹Rs\.?\s]*(\d+(?:\.\d{2})?)'
            item_matches = re.findall(item_pattern, text)
            for item_name, item_amount in item_matches[:5]:  # Top 5 items
                items.append({
                    'name': item_name.strip(),
                    'amount': float(item_amount)
                })
            
            # Categorize based on merchant/items
            category_keywords = {
                'Food': ['swiggy', 'zomato', 'restaurant', 'cafe', 'food', 'biryani', 'pizza', 'burger'],
                'Shopping': ['amazon', 'flipkart', 'store', 'shop', 'mall', 'mart'],
                'Transport': ['uber', 'ola', 'taxi', 'petrol', 'fuel', 'parking'],
                'Utility Bills': ['electricity', 'water', 'gas', 'bill', 'recharge', 'mobile'],
                'Entertainment': ['movie', 'cinema', 'ticket', 'bookmyshow', 'game'],
            }
            
            suggested_category = 'Others'
            text_lower = text.lower()
            
            for category, keywords in category_keywords.items():
                if any(keyword in text_lower for keyword in keywords):
                    suggested_category = category
                    break
            
            result = {
                'amount': total_amount,
                'merchant': merchant,
                'items': items,
                'category': suggested_category,
                'raw_text': text[:500]  # First 500 chars
            }
            
            print(f"✅ Parsed: Amount={total_amount}, Category={suggested_category}")
            return result
            
        except Exception as e:
            print(f"❌ Parsing error: {e}")
            return {
                'amount': None,
                'merchant': None,
                'items': [],
                'category': 'Others',
                'raw_text': text[:500] if text else ''
            }


# ============================================
# AUDIO PROCESSOR
# ============================================

class AudioProcessor:
    """Handles audio file conversion and processing"""
    
    def __init__(self):
        self.temp_dir = Config.AUDIO_TEMP_DIR
    
    def is_allowed_file(self, filename):
        """Check if file extension is allowed"""
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_AUDIO_EXTENSIONS
    
    def convert_to_wav(self, input_path):
        """Convert audio to WAV format (16kHz, mono) for Whisper"""
        try:
            if not PYDUB_AVAILABLE:
                if input_path.endswith('.wav'):
                    return input_path
                else:
                    raise Exception("pydub not installed - cannot convert audio format")
            
            print(f"🔄 Converting audio to WAV...")
            
            audio = AudioSegment.from_file(input_path)
            audio = audio.set_channels(1)
            audio = audio.set_frame_rate(16000)
            
            output_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
            audio.export(output_path, format='wav')
            
            print(f"✅ Converted to WAV: {output_path}")
            return output_path
            
        except Exception as e:
            print(f"⚠️ Conversion error: {e}")
            return input_path
    
    def cleanup(self, *file_paths):
        """Delete temporary files"""
        for path in file_paths:
            try:
                if path and os.path.exists(path):
                    os.unlink(path)
                    print(f"🗑️ Cleaned up: {path}")
            except Exception as e:
                print(f"⚠️ Cleanup error: {e}")


# ============================================
# NODE.JS API CLIENT
# ============================================

class NodeJSClient:
    """Client for calling Node.js backend APIs"""
    
    def __init__(self, base_url):
        self.base_url = base_url
    
    def categorize_text(self, text, token=None):
        """Call Node.js /api/categorize endpoint"""
        try:
            print(f"📤 Calling Node.js API to categorize: \"{text}\"")
            
            headers = {
                'Content-Type': 'application/json'
            }
            
            if token:
                headers['Authorization'] = f'Bearer {token}'
            
            response = requests.post(
                f"{self.base_url}/api/categorize",
                headers=headers,
                json={'text': text},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Node.js response: {result}")
                return result
            else:
                print(f"❌ Node.js API Error: {response.status_code}")
                print(f"Response: {response.text}")
                return None
                
        except Exception as e:
            print(f"❌ Node.js API call error: {e}")
            return None
    
    def health_check(self):
        """Check if Node.js backend is running"""
        try:
            response = requests.get(f"{self.base_url}/api/health", timeout=5)
            return response.status_code == 200
        except:
            return False


# Initialize clients
whisper_client = GroqWhisperClient(Config.GROQ_API_KEY)
audio_processor = AudioProcessor()
ocr_processor = OCRProcessor()
nodejs_client = NodeJSClient(Config.NODE_BACKEND_URL)


# ============================================
# API ROUTES
# ============================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    
    nodejs_healthy = nodejs_client.health_check()
    
    return jsonify({
        'status': 'healthy',
        'service': 'python-audio-file-processor',
        'nodejs_backend': 'connected' if nodejs_healthy else 'disconnected',
        'groq_api': 'configured' if Config.GROQ_API_KEY else 'missing',
        'pydub': 'available' if PYDUB_AVAILABLE else 'missing',
        'ocr': {
            'easyocr': 'available' if EASYOCR_AVAILABLE else 'missing',
            'tesseract': 'available' if TESSERACT_AVAILABLE else 'missing',
            'pdf': 'available' if PDF_AVAILABLE else 'missing'
        },
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/analyze-audio', methods=['POST'])
def analyze_audio():
    """
    Main endpoint: Analyze audio file
    
    Flow:
    1. Receive audio file from frontend
    2. Convert to WAV if needed
    3. Transcribe with Groq Whisper
    4. Call Node.js /api/categorize
    5. Return result to frontend
    """
    
    temp_file = None
    wav_file = None
    
    try:
        if 'audio' not in request.files:
            return jsonify({
                'success': False,
                'message': 'No audio file provided'
            }), 400
        
        audio_file = request.files['audio']
        
        if audio_file.filename == '':
            return jsonify({
                'success': False,
                'message': 'Empty filename'
            }), 400
        
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header else None
        
        print(f"\n{'='*50}")
        print(f"📁 Received audio: {audio_file.filename}")
        print(f"📊 Size: {audio_file.content_length} bytes")
        print(f"{'='*50}\n")
        
        timestamp = int(datetime.now().timestamp() * 1000)
        temp_filename = f"audio_{timestamp}.webm"
        temp_file = os.path.join(Config.AUDIO_TEMP_DIR, temp_filename)
        
        audio_file.save(temp_file)
        print(f"💾 Saved to: {temp_file}")
        
        wav_file = audio_processor.convert_to_wav(temp_file)
        
        print(f"\n🎙️ STEP 1: Transcribing audio...")
        transcription = whisper_client.transcribe(wav_file, language='en')
        
        if not transcription or len(transcription.strip()) == 0:
            return jsonify({
                'success': False,
                'message': 'Could not transcribe audio'
            }), 400
        
        print(f"✅ Transcription: \"{transcription}\"\n")
        
        print(f"🤖 STEP 2: Calling Node.js Groq LLM for categorization...")
        categorization = nodejs_client.categorize_text(transcription, token)
        
        if not categorization:
            return jsonify({
                'success': True,
                'transcription': transcription,
                'expense': {
                    'amount': extract_amount(transcription),
                    'category': 'Others',
                    'description': transcription,
                    'original_text': transcription
                },
                'metadata': {
                    'source': 'fallback',
                    'confidence': 0.3,
                    'note': 'Node.js backend not available'
                }
            })
        
        print(f"✅ STEP 3: Returning result to frontend\n")
        
        response_data = {
            'success': True,
            'transcription': transcription,
            'expense': categorization.get('expense', {}),
            'metadata': categorization.get('metadata', {})
        }
        
        print(f"📤 Response: {json.dumps(response_data, indent=2)}\n")
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"\n❌ Error processing audio: {str(e)}\n")
        return jsonify({
            'success': False,
            'message': f'Error processing audio: {str(e)}'
        }), 500
        
    finally:
        audio_processor.cleanup(temp_file, wav_file if wav_file != temp_file else None)


@app.route('/api/analyze-file', methods=['POST'])
def analyze_file():
    """
    NEW: Analyze uploaded file (image/PDF)
    
    Flow:
    1. Receive file from frontend
    2. Perform OCR to extract text
    3. Parse receipt to extract amount/category
    4. Optionally call Node.js for better categorization
    5. Return result to frontend
    """
    
    temp_file = None
    
    try:
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'message': 'No file provided'
            }), 400
        
        uploaded_file = request.files['file']
        
        if uploaded_file.filename == '':
            return jsonify({
                'success': False,
                'message': 'Empty filename'
            }), 400
        
        # Get file extension
        file_ext = uploaded_file.filename.rsplit('.', 1)[1].lower() if '.' in uploaded_file.filename else ''
        
        # Validate file type
        is_image = file_ext in Config.ALLOWED_IMAGE_EXTENSIONS
        is_pdf = file_ext in Config.ALLOWED_PDF_EXTENSIONS
        
        if not (is_image or is_pdf):
            return jsonify({
                'success': False,
                'message': f'Unsupported file type: {file_ext}'
            }), 400
        
        auth_header = request.headers.get('Authorization', '')
        token = auth_header.replace('Bearer ', '') if auth_header else None
        
        print(f"\n{'='*50}")
        print(f"📁 Received file: {uploaded_file.filename}")
        print(f"📊 Size: {uploaded_file.content_length} bytes")
        print(f"📝 Type: {'Image' if is_image else 'PDF'}")
        print(f"{'='*50}\n")
        
        # Save uploaded file
        timestamp = int(datetime.now().timestamp() * 1000)
        temp_filename = f"upload_{timestamp}.{file_ext}"
        temp_file = os.path.join(Config.UPLOAD_TEMP_DIR, temp_filename)
        
        uploaded_file.save(temp_file)
        print(f"💾 Saved to: {temp_file}")
        
        # STEP 1: Extract text using OCR
        print(f"\n📖 STEP 1: Extracting text from {file_ext.upper()}...")
        
        if is_image:
            extracted_text = ocr_processor.extract_text_from_image(temp_file)
        elif is_pdf:
            extracted_text = ocr_processor.extract_text_from_pdf(temp_file)
        else:
            raise Exception("Unsupported file type")
        
        if not extracted_text or len(extracted_text.strip()) < 10:
            return jsonify({
                'success': False,
                'message': 'Could not extract text from file. Please ensure the image is clear.'
            }), 400
        
        print(f"✅ Extracted: {len(extracted_text)} characters\n")
        
        # STEP 2: Parse receipt
        print(f"🧾 STEP 2: Parsing receipt data...")
        parsed_data = ocr_processor.parse_receipt(extracted_text)
        
        # STEP 3: Optionally enhance with Node.js LLM
        print(f"\n🤖 STEP 3: Enhancing categorization with Node.js LLM...")
        
        # Create a description from extracted text
        description = f"{parsed_data.get('merchant', 'Receipt')} - {parsed_data.get('amount', 'Unknown amount')}"
        if parsed_data.get('items'):
            top_items = ', '.join([item['name'] for item in parsed_data['items'][:3]])
            description += f" ({top_items})"
        
        # Call Node.js for better categorization
        llm_result = nodejs_client.categorize_text(description, token)
        
        # Combine OCR parsing with LLM categorization
        if llm_result and llm_result.get('success'):
            llm_expense = llm_result.get('expense', {})
            final_category = llm_expense.get('category', parsed_data['category'])
            final_amount = parsed_data['amount'] or llm_expense.get('amount')
        else:
            final_category = parsed_data['category']
            final_amount = parsed_data['amount']
        
        # STEP 4: Return result
        print(f"✅ STEP 4: Returning result to frontend\n")
        
        response_data = {
            'success': True,
            'file_type': 'image' if is_image else 'pdf',
            'extracted_text': extracted_text[:500],  # First 500 chars
            'expense': {
                'amount': final_amount,
                'category': final_category,
                'description': description,
                'merchant': parsed_data.get('merchant'),
                'items': parsed_data.get('items', [])
            },
            'metadata': {
                'source': 'ocr_processing',
                'ocr_engine': 'easyocr' if EASYOCR_AVAILABLE else 'tesseract',
                'parsed_items_count': len(parsed_data.get('items', [])),
                'confidence': 0.85 if parsed_data['amount'] else 0.50
            }
        }
        
        print(f"📤 Response: {json.dumps(response_data, indent=2)}\n")
        
        return jsonify(response_data)
        
    except Exception as e:
        print(f"\n❌ Error processing file: {str(e)}\n")
        return jsonify({
            'success': False,
            'message': f'Error processing file: {str(e)}'
        }), 500
        
    finally:
        if temp_file and os.path.exists(temp_file):
            try:
                os.unlink(temp_file)
                print(f"🗑️ Cleaned up: {temp_file}")
            except:
                pass


@app.route('/api/test-ocr', methods=['POST'])
def test_ocr():
    """Test endpoint: Just extract text from image/PDF"""
    
    temp_file = None
    
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file'}), 400
        
        uploaded_file = request.files['file']
        file_ext = uploaded_file.filename.rsplit('.', 1)[1].lower()
        
        timestamp = int(datetime.now().timestamp() * 1000)
        temp_file = os.path.join(Config.UPLOAD_TEMP_DIR, f"test_{timestamp}.{file_ext}")
        uploaded_file.save(temp_file)
        
        if file_ext in Config.ALLOWED_IMAGE_EXTENSIONS:
            text = ocr_processor.extract_text_from_image(temp_file)
        elif file_ext in Config.ALLOWED_PDF_EXTENSIONS:
            text = ocr_processor.extract_text_from_pdf(temp_file)
        else:
            return jsonify({'error': 'Unsupported file type'}), 400
        
        return jsonify({
            'success': True,
            'extracted_text': text
        })
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500
        
    finally:
        if temp_file and os.path.exists(temp_file):
            os.unlink(temp_file)


# ============================================
# UTILITY FUNCTIONS
# ============================================

def extract_amount(text):
    """Extract amount from text (simple regex)"""
    patterns = [
        r'[₹Rs\.?\s]*(\d+)',
        r'(\d+)\s*(?:rupees?|Rs\.?)?',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            return int(match.group(1))
    
    return None


# ============================================
# MAIN
# ============================================

def main():
    print("\n" + "="*60)
    print("🎙️📄  PYTHON AUDIO + FILE PROCESSING BACKEND")
    print("="*60)
    print(f"\n📡 Port: {Config.PORT}")
    print(f"🔗 Node.js Backend: {Config.NODE_BACKEND_URL}")
    print(f"🤖 Groq API: {'✅ Configured' if Config.GROQ_API_KEY else '❌ Missing'}")
    print(f"🎵 Audio Processing: {'✅ pydub' if PYDUB_AVAILABLE else '⚠️ Limited'}")
    print(f"📖 OCR Engines:")
    print(f"  - EasyOCR: {'✅' if EASYOCR_AVAILABLE else '❌'}")
    print(f"  - Tesseract: {'✅' if TESSERACT_AVAILABLE else '❌'}")
    print(f"📄 PDF Processing: {'✅' if PDF_AVAILABLE else '❌'}")
    
    # Check Node.js connection
    print(f"\n🔍 Checking Node.js backend...")
    if nodejs_client.health_check():
        print(f"✅ Node.js backend is running")
    else:
        print(f"⚠️ Node.js backend not reachable at {Config.NODE_BACKEND_URL}")
    
    print("\n" + "="*60)
    print("🚀 SUPPORTED FLOWS:")
    print("\n  1️⃣ AUDIO:")
    print("     Frontend → Python (/api/analyze-audio)")
    print("     → Groq Whisper → Node.js → Frontend")
    print("\n  2️⃣ FILE UPLOAD (NEW):")
    print("     Frontend → Python (/api/analyze-file)")
    print("     → OCR → Parse → Node.js LLM → Frontend")
    print("="*60 + "\n")
    
    app.run(
        host=Config.HOST,
        port=Config.PORT,
        debug=Config.DEBUG
    )


if __name__ == "__main__":
    main()