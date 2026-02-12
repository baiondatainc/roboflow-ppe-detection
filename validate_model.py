#!/usr/bin/env python3
"""
Model Response Validation Tool
Validates model responses against expected format and displays detailed analysis
"""

import json
import sys
from pathlib import Path
from datetime import datetime

def validate_prediction_format(prediction):
    """Validate a single prediction has correct structure"""
    required_fields = ["x", "y", "width", "height", "confidence", "class"]
    optional_fields = ["class_id", "detection_id"]
    
    errors = []
    warnings = []
    
    # Check required fields
    for field in required_fields:
        if field not in prediction:
            errors.append(f"Missing required field: {field}")
        else:
            # Validate field types
            if field in ["x", "y", "width", "height", "confidence"]:
                if not isinstance(prediction[field], (int, float)):
                    errors.append(f"{field} must be numeric, got {type(prediction[field])}")
            elif field == "class":
                if not isinstance(prediction[field], str):
                    errors.append(f"class must be string, got {type(prediction[field])}")
    
    # Check optional fields
    for field in optional_fields:
        if field in prediction and not isinstance(prediction[field], (str, int)):
            warnings.append(f"{field} should be string/int, got {type(prediction[field])}")
    
    # Validate value ranges
    if "confidence" in prediction:
        conf = prediction["confidence"]
        if not (0.0 <= conf <= 1.0):
            errors.append(f"confidence {conf} out of range [0.0, 1.0]")
    
    return errors, warnings

def analyze_predictions(data, confidence_threshold=0.4):
    """Analyze full prediction response"""
    
    if not isinstance(data, dict):
        print("❌ Response is not a JSON object")
        return False
    
    if "predictions" not in data:
        print("❌ Missing 'predictions' field in response")
        return False
    
    predictions = data["predictions"]
    if not isinstance(predictions, list):
        print("❌ 'predictions' must be a list")
        return False
    
    print("\n" + "="*80)
    print("📋 RESPONSE VALIDATION REPORT")
    print("="*80)
    
    print(f"\n📊 OVERVIEW:")
    print(f"   Total predictions: {len(predictions)}")
    print(f"   Confidence threshold: {confidence_threshold}")
    
    if "image" in data:
        img = data["image"]
        print(f"   Image dimensions: {img.get('width')}x{img.get('height')}")
    
    # Validate each prediction
    print(f"\n✓ PREDICTION VALIDATION:")
    print("-" * 80)
    
    total_errors = 0
    total_warnings = 0
    persons_found = 0
    passed_threshold = 0
    
    for i, pred in enumerate(predictions, 1):
        errors, warnings = validate_prediction_format(pred)
        
        class_name = pred.get("class", "unknown")
        confidence = pred.get("confidence", 0)
        
        # Track persons
        if class_name.lower() == "person":
            persons_found += 1
        
        if confidence >= confidence_threshold:
            passed_threshold += 1
        
        # Report
        status = "✅" if not errors else "❌"
        conf_pct = confidence * 100 if isinstance(confidence, (int, float)) else "N/A"
        
        print(f"\n   [{i}] {status} {class_name} - Confidence: {conf_pct}%")
        
        if errors:
            for error in errors:
                print(f"        ❌ {error}")
                total_errors += 1
        
        if warnings:
            for warning in warnings:
                print(f"        ⚠️  {warning}")
                total_warnings += 1
        
        # Show coordinates
        if "x" in pred and "y" in pred:
            x, y = pred["x"], pred["y"]
            w, h = pred.get("width", "?"), pred.get("height", "?")
            print(f"        Position: ({x}, {y}) | Size: {w}x{h}")
    
    # Summary
    print("\n" + "-"*80)
    print(f"\n📈 SUMMARY:")
    print(f"   Valid predictions: {len(predictions) - total_errors}")
    print(f"   Validation errors: {total_errors}")
    print(f"   Warnings: {total_warnings}")
    print(f"   Passed confidence threshold: {passed_threshold}/{len(predictions)}")
    print(f"\n👥 PERSON DETECTION: {persons_found} person(s) found")
    
    # PPE Compliance
    print(f"\n🛡️  PPE COMPLIANCE CHECK:")
    classes = {}
    for pred in predictions:
        cls = pred.get("class", "unknown").lower()
        conf = pred.get("confidence", 0)
        if conf >= confidence_threshold:
            if cls not in classes:
                classes[cls] = []
            classes[cls].append(conf)
    
    has_person = any(k for k in classes.keys() if "person" in k)
    has_hardhat = any(k for k in classes.keys() if any(x in k for x in ["hardhat", "helmet", "head"]))
    has_gloves = any(k for k in classes.keys() if any(x in k for x in ["glove", "hand"]))
    has_vest = any(k for k in classes.keys() if any(x in k for x in ["vest", "jacket", "safety"]))
    
    print(f"   👥 Person: {'✅' if has_person else '❌'}")
    print(f"   🎩 Head Protection: {'✅' if has_hardhat else '❌'}")
    print(f"   🧤 Hand Protection: {'✅' if has_gloves else '❌'}")
    print(f"   🦺 Body Protection: {'✅' if has_vest else '❌'}")
    
    is_compliant = has_person and has_hardhat and has_gloves and has_vest
    print(f"\n   Status: {'✅ COMPLIANT' if is_compliant else '❌ NON-COMPLIANT'}")
    
    # Recommendations
    if total_errors > 0:
        print(f"\n⚠️  ISSUES FOUND:")
        print(f"   • Fix validation errors above")
        print(f"   • Check model inference server")
    
    if persons_found == 0:
        print(f"\n⚠️  NO PERSONS DETECTED:")
        print(f"   • This is why UI shows 'Persons Detected: 0'")
        print(f"   • Check:")
        print(f"     - Person is clearly visible in frame")
        print(f"     - Model is trained on person detection")
        print(f"     - Confidence threshold is appropriate")
    
    print("\n" + "="*80)
    
    return total_errors == 0

def validate_from_file(filepath):
    """Validate predictions from saved JSON file"""
    
    filepath = Path(filepath)
    if not filepath.exists():
        print(f"❌ File not found: {filepath}")
        return False
    
    print(f"\n📂 Loading: {filepath}")
    
    try:
        with open(filepath) as f:
            data = json.load(f)
        
        # Extract predictions from test output format
        if "predictions" in data:
            predictions = data["predictions"]
        elif "predictions" in data.get("predictions", {}):
            # Nested format
            data = data["predictions"]
            predictions = data
        else:
            predictions = data
        
        # Wrap if needed
        if isinstance(predictions, list):
            data = {"predictions": predictions}
        
        return analyze_predictions(data)
    
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def validate_from_string(json_string):
    """Validate predictions from JSON string"""
    
    try:
        data = json.loads(json_string)
        return analyze_predictions(data)
    except json.JSONDecodeError as e:
        print(f"❌ Invalid JSON: {e}")
        return False

def show_expected_format():
    """Show expected response format"""
    
    print("\n" + "="*80)
    print("📋 EXPECTED MODEL RESPONSE FORMAT")
    print("="*80)
    
    expected = {
        "predictions": [
            {
                "x": 320,
                "y": 240,
                "width": 150,
                "height": 200,
                "confidence": 0.95,
                "class": "person",
                "class_id": 0,
                "detection_id": "uuid-string"
            },
            {
                "x": 330,
                "y": 180,
                "width": 100,
                "height": 80,
                "confidence": 0.88,
                "class": "hardhat",
                "class_id": 4,
                "detection_id": "uuid-string"
            }
        ],
        "image": {
            "width": 640,
            "height": 480
        }
    }
    
    print("\n🔹 REQUIRED STRUCTURE:")
    print(json.dumps(expected, indent=2))
    
    print("\n📌 FIELD DESCRIPTIONS:")
    print("""
   x, y        = Center coordinates of bounding box
   width       = Bounding box width in pixels
   height      = Bounding box height in pixels
   confidence  = Detection confidence [0.0 - 1.0]
   class       = Class name (e.g., "person", "hardhat", "gloves")
   class_id    = (Optional) Numeric class ID
   detection_id = (Optional) Unique detection ID
   """)
    
    print("="*80)

def main():
    """Main function"""
    
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        
        if arg == "--help" or arg == "-h":
            print("""
PPE Model Response Validator
Usage:
    python validate_model.py                  # Show expected format
    python validate_model.py <json_file>     # Validate JSON file
    python validate_model.py <json_string>   # Validate JSON string
""")
            show_expected_format()
        
        elif arg.endswith(".json"):
            # Validate file
            validate_from_file(arg)
        
        elif arg.startswith("{"):
            # Validate JSON string
            validate_from_string(arg)
        
        else:
            # Try as file first
            if not validate_from_file(arg):
                # Try as JSON string
                print("\nTrying as JSON string...")
                validate_from_string(arg)
    
    else:
        # Show expected format
        show_expected_format()
        
        # Look for recent test files
        test_dir = Path("test_output")
        if test_dir.exists():
            json_files = sorted(test_dir.glob("*.json"))
            if json_files:
                print("\n" + "="*80)
                print("📁 RECENT TEST FILES FOUND:")
                print("="*80)
                for f in json_files[-5:]:
                    print(f"\n   python validate_model.py {f}")

if __name__ == "__main__":
    main()
