"""Independent QA only: decode exported QR pixels with ZXing-C++, not jsQR."""
import json
import sys
from PIL import Image
import numpy as np
import zxingcpp

image = Image.open(sys.argv[1]).convert('RGB')
codes = zxingcpp.read_barcodes(np.asarray(image))
if len(codes) != 1:
    raise RuntimeError('Expected exactly one QR, found '+str(len(codes)))
print(json.dumps({'payload':codes[0].text,'width':image.width,'height':image.height,
                  'decoder':'ZXing-C++ 2.3.0','format':str(codes[0].format)}))
