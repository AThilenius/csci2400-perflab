#include <chrono>
#include <iostream>
#include <string>
#include <unordered_map>

#include "bitmap_image.hpp"

using ::std::cout;
using ::std::endl;
using ::std::string;
using ::std::unordered_map;
using ::std::chrono::duration_cast;
using ::std::chrono::high_resolution_clock;
using ::std::chrono::nanoseconds;

struct Filter {
  int32_t divisor;
  int32_t values[9];
};

// Define a few filters, keyed by name.
unordered_map<string, Filter> filters_by_name = {
    {"gauss",
     {
         24,
         {0, 4, 0, 4, 8, 4, 0, 4, 0},
     }},
    {"vline",
     {
         1,
         {-1, 0, 1, -2, 0, 2, -1, 0, 1},
     }},
    {"hline",
     {
         1,
         {-1, -2, -1, 0, 0, 0, 1, 2, 1},
     }}};

int main(int argc, char* argv[]) {
  // Please don't actually handle args like this, use `gflags` or something.
  if (argc < 3) {
    cout << "Usage: perflab <filter> <bmp file path>" << endl;
    return -1;
  }
  // Load the filter from name (or panic).
  Filter filter = filters_by_name[argv[1]];
  // Load the input bmp.
  bitmap_image input_bmp(argv[2]);
  if (!input_bmp) {
    cout << "Failed to load image at " << argv[2] << endl;
    return -1;
  }
  // The output bmp
  bitmap_image output_bmp(input_bmp.width(), input_bmp.height());
  // Start counting reference cycles and apply the filter.
  auto start_time = high_resolution_clock::now();
  for (uint32_t y = 1; y < input_bmp.height() - 1; y++) {
    for (uint32_t x = 1; x < input_bmp.width() - 1; x++) {
      // Sum the product of each 9 pixels and the filter value.
      int32_t r_total = 0, g_total = 0, b_total = 0;
      for (int j = 0; j < 3; j++) {
        for (int i = 0; i < 3; i++) {
          rgb_t pixel = input_bmp.get_pixel(x + j - 1, y + i - 1);
          int32_t filter_value = filter.values[(i * 3) + j];
          r_total += pixel.red * filter_value;
          g_total += pixel.green * filter_value;
          b_total += pixel.blue * filter_value;
        }
      }
      // Divide each by the filter divisor
      r_total /= filter.divisor;
      g_total /= filter.divisor;
      b_total /= filter.divisor;
      // Clamp each to [0, 255]
      r_total = r_total < 0 ? 0 : (r_total > 255 ? 255 : r_total);
      g_total = g_total < 0 ? 0 : (g_total > 255 ? 255 : g_total);
      b_total = b_total < 0 ? 0 : (b_total > 255 ? 255 : b_total);
      // Save it to output bmp
      output_bmp.set_pixel(x, y, r_total, g_total, b_total);
    }
  }
  auto stop_time = high_resolution_clock::now();
  uint64_t ns = duration_cast<nanoseconds>(stop_time - start_time).count();
  cout << "Processing the image took around "
       << (float)ns / (input_bmp.width() * input_bmp.height())
       << " nanoseconds per pixel." << endl;
  // Save the output to disk
  output_bmp.save_image("output.bmp");
}
