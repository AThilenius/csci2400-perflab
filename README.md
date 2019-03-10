# CU Boulder - CSCI 2400 - Performance Lab

_Supplementary material, as discussed by a salty, idiot of an engineer with
overly-strong opinions._

# Let's talk about optimization

![stop trying to make optimization a thing](https://i.imgflip.com/2vnn4c.jpg)

The TL;DR is don't do it, unless you want all your coworkers to hate you.
Engineer time is expensive, faster machines are cheap.

Source code that is clean and logical (aka you don't have any fundamental
computational complexity issues) can be optimized by a compiler. `LLVM` is the
actual compiler behind `clang`, and it was written by people smarter than me
(and probably you). When you write source code, you should write it for humans.
In a year when someone needs to read through your code (and that someone is
likely you) and can't make any sense out of it, then your code is useless and
goes into the fuck-it-bucket, where it belongs.

Optimization is also a black-magic topic. When you profile code you will always,
100% of the time, be surprised by what is slow and what isn't. Computers are
really complicated. CPUs alone are immensely complicated, they have out-of-order
execution units, predict what branch your code will follow, have a zillion
layers of caching and that's all before your kernel gets ahold of it. A lot of
the time _optimization_ means rethinking the problem. For example (hint hint):
**are you sure the CPU is where you want to solve this problem?**

# So what can we do without optimizations?

Well the first thing you can do is take the dumpster-fire of a starting codebase
out back and put it out of its misery. In an effort to not be **too** salty,
I'm going to refrain from enumerating all the dumpster-fire-qualities of the
starting `perflab-setup` code. Let's just tl;dr it as "it's garbage and was way
easier to rewrite than to figure out WTF was going on".

![perflab setup](https://i.imgflip.com/2vnkc9.jpg)

**If you or anyone you know came into contact with perflab-setup code, please
immediately assume a fetal position while deeply weeping until the desire to
change majors passes.**

## Rewrite _all_ of it

```c++
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
```

The only thing non-standard is [the header-only bmp
library](https://github.com/ArashPartow/bitmap). _Build and run by cloning this
repo, then `./make_and_test.sh`. You'll need cmake._

That's it. Nothing fancy, no optimizations at all. "Clean" code (_clean is in
air-quotes because everyone thinks their own shit don't stink_) that LLVM can
optimize for me. This gives me an output of: `Processing the image took around 16.565 nanoseconds per pixel.` Which on my 4ghz machine would be equivalent to
66 cycles per pixel. Not screaming fast, but fast enough and all in a handful of
readable lines.

# Faster!

![let's over optimize](https://i.imgflip.com/2vnkli.jpg)

When I did this assignment for-real back at CU, I got it down to a CPP in the
20s, without MMX and without multi-threading. It was a lot of work. Once you get
to a point like the above (something sane that doesn't make your eyeballs bleed
to read) then the only thing left are micro-optimizations that get ever
increasingly more difficult. For the sake of 'food for thought' I'll offer up
some idea on how to make the above faster. I long ago lost the assignment itself
and don't feel like spending the next week optimizing something pointless.

## Rethink the filter

To apply the filter we select 9 pixel components (9 8-bit values) and multiply
them by the corresponding filter values. These all get summed then divided by
the filter divisor.

In math terms, that's the exact same as pre-dividing each filter value by the
divisor, then just summing up (each pixel \* pre-computed filter value). Cool,
we just cut the division (which it relatively expensive) out of the equation _<-
see what I did there_.

We can go further though. Each pixel component is only 8-bits, meaning there are
only 256 possible values. For each filter value, we can pre-compute the results
of (pixel value \* (filter value / divisor)). Then, the only math that needs to
be done in the critical section is addition, the rest is simply lookups into
this table. Doing just that you can get down to the 30s.

There is a catch though: integer division. If you pre-compute (filter value /
divisor) then that cannot be stored as a normal 8-bit integer value. The easy
way to go here is to use floats, but float math is a bit slower that integer
math. Another way is to first cast the filter value to an i32, then bit-shift it
up 8-bits (the same as multiplying it by 256). That gives you enough precision
that the division should be fine. You'll have to downshift 8-bits after the
summation as well, but shifting is very cheap.

## Cache coherency is king

CPU optimizations won't mean jack-shit if you're sitting there waiting for RAM
99% of the time because of cache misses. Caching is very complicated (hint, all
the things your professor is telling you about how caching works in modern CPUs
is a white lie). The ideal to strive for is usually sequential memory access,
which is rarely possible, so you want 'as sequential as possible'. There are a
few ways to go about this:

### Tile the image data

You can break the image up into smaller images of NxN, this is known as tiling.
If you play around with the size of N, you can get it 'just small enough' to fit
into the higher-order CPU caches (yes, there are several layers of them,
surprise! L1 is the only cache layer that can be accessed once per CPU cycle).
Because you need neighbor pixel data though, your tiles will need to 'overlap'.
This is your best bet for this lab (apart from maybe the 'cheater' version
below). This has the advantage of being trivially-parallelizable though, so
throw a few cores at it if you want.

### Z-Order Curve / Morton Ordering

There is another encoding sometimes used on graphics cards and for voxel-based
games called a [z-order curve](https://en.wikipedia.org/wiki/Z-order_curve).
It's a way to recursively pack N-dimensional data into a fractal data structure
that optimizes cache coherency (aka neighboring pixels are **often** close
together in flat memory).

![morton
ordering](https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Four-level_Z.svg/300px-Four-level_Z.svg.png)

These come with a cost though: the actual computation of where in the array the
pixel you're looking for lives. You can reduce the cost of this computation by
forcing your dimensions to all be powers of 2, at which point multiplication can
all be replaced with much faster bit-shifting. _For you graphics programmers out
there, ever wondered why your textures all have to be a power of 2?_

### Cheat a bit

You could also just store each pixel component along with it's 8 neighbors (aka
duplicate all the neighbors and store them along with the pixel itself). This
means the input array is much larger, but data access can be **PERFECTLY**
sequential. This is a real stretch though, because no one in their right mind
would encode images 8X as large as they need to be. It's cheating the problem in
my opinion. Then again cheating the problem is often a viable strategy...

## Pointers

![pointers](https://i.imgflip.com/2vn3dd.jpg)

**This part makes me sad to write. Please, for the love of Gaben, don't write
code like this...**

You can replace all C array access with direct pointer manipulation.

```c
// An array of 10 ints (remember, an int is either 4 or 8 bytes)
int foo[10];
// Normal array access semantics.
int third_element = foo[2];
// A pointer to the start of the array.
int* start_ptr = &foo[0];
// Add to the actual pointer itself (not the value it points to).
int* third_elem_ptr = start_ptr + (sizeof(int) * 2);
// You can 'deref' that pointer to get the value.
int also_third_element = *third_elem_ptr;
```

To be as fast as possible your image array should be 1D (N-dimensional arrays
are collapsed down to 1D by the compiler anyway, but you can do that math
manually). Computing the position in this 1D array for the X,Y pixel component
is trivial: `data[y * width + x]`. However, there is still a multiplication in
there we can get rid of. If you store a pointer to the pixel that corresponds to
the leftmost of the 9 pixel lookups, one pointer for each row, then you can get
real clever with only using addition to increment those pointers. Compilers
often do things like this for you, but they cannot know what your code is
'supposed to do' so they can only optimize in places that don't impact execution
outcomes.

Again, please don't actually do this in real life, it produces disgusting,
unreadable code. Compilers are pretty clever, they can do most of this for you.
You'll still be able to gain some performance with manual pointer manipulation
though, because you know more about the logic of your code that the compiler
does.

# More faster-er? 0.19 cycles-per-pixel? In JavaScript?

![hold my beer](https://i.imgflip.com/2vnkwu.jpg)

This type of work is what graphics cards are designed for. I get a cycles per
pixel of 0.19 running on my desktop's graphics card.

Yes, zero **point** one nine, that's not a typo. You can run the [in-browser
demo](https://thilenius-perflab-demo.firebaseapp.com/) on your machine as well.
**Be aware it might also crash your browser** because there is no decent way to
benchmark this apart from impacting the framerate and timing each frame.
Ratchet, I know.

The power of a single GPU is truly breathtaking. My card is rendering each pixel
in about 50 picoseconds. Just to put things into perspective, a picosecond is to
one second as one second is to 31,689 years (thank you wiki). 50 picoseconds is
the time it takes light to travel 15mm.

## How it chooch?

GPU programming is done in a C-like language called GLSL. There are two pieces
to most graphics programs. The first is a vertex shader, which we don't care
about, so it's just a pass-through for rendering a single rectangle:

```glsl
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
```

The more interesting part in this case is the fragment shader. This gets run
**once for each pixel** and does the actual filtering. Clamping (in graphics
land called saturating) is done implicitly for colors.

```glsl
uniform sampler2D texture;
uniform float filter[9];
uniform float divisor;

varying vec2 vUv;

void main() {
  float step = 1.0 / 1024.0;
  // Remember GLSL y goes downward
  gl_FragColor = (
      texture2D(texture, vec2(vUv.x - step, vUv.y + step)) * filter[0] +
      texture2D(texture, vec2(vUv.x, vUv.y + step)) * filter[1] +
      texture2D(texture, vec2(vUv.x + step, vUv.y + step)) * filter[2] +
      texture2D(texture, vec2(vUv.x - step, vUv.y)) * filter[3] +
      texture2D(texture, vUv) * filter[4] +
      texture2D(texture, vec2(vUv.x + step, vUv.y)) * filter[5] +
      texture2D(texture, vec2(vUv.x - step, vUv.y - step)) * filter[6] +
      texture2D(texture, vec2(vUv.x, vUv.y - step)) * filter[7] +
      texture2D(texture, vec2(vUv.x + step, vUv.y - step)) * filter[8]
    ) / divisor;
}
```

Hardware accelerated graphics is way outside the scope of this assignment so
we'll leave this here. If you want to take a look at the Javascript source code, it's all
in `/webgl/src`.

---

![fin](https://i.imgflip.com/2vnmxb.jpg)
